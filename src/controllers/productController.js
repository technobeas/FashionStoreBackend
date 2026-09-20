import mongoose from "mongoose";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import Category from "../models/Category.js";
import Collection from "../models/Collection.js";
import FashionSize from "../models/FashionSize.js";
import SizeChart from "../models/SizeChart.js";
import { productInput } from "../utils/validation.js";
import { adminProduct, publicProduct } from "../utils/publicProduct.js";
import { slugify } from "../utils/slug.js";
import { uploadBuffer, destroyAsset } from "../services/cloudinaryService.js";

async function uniqueSlug(name, id, tenantId) {
  const base = slugify(name);
  let slug = base, n = 1;
  while (await Product.exists({ tenantId, slug, ...(id ? { _id: { $ne: id } } : {}) })) slug = `${base}-${n++}`;
  return slug;
}

async function validateSizeChart(tenantId, sizeChartId) {
  if (!sizeChartId) return null;
  if (!mongoose.isValidObjectId(sizeChartId)) {
    const e = new Error("Invalid size chart.");
    e.status = 400;
    throw e;
  }
  const chart = await SizeChart.findOne({ _id: sizeChartId, tenantId }).select("_id").lean();
  if (!chart) {
    const e = new Error("Size chart does not belong to this tenant.");
    e.status = 400;
    throw e;
  }
  return chart._id;
}

async function validateProductSizes(tenantId, sizes = []) {
  const normalized = [...new Set((Array.isArray(sizes) ? sizes : []).map(v => String(v).trim().toUpperCase()).filter(Boolean))];
  if (!normalized.length) return normalized;
  const found = await FashionSize.find({ tenantId, key: { $in: normalized }, isActive: true }).select("key").lean();
  const allowed = new Set(found.map(x => x.key));
  const invalid = normalized.filter(x => !allowed.has(x));
  if (invalid.length) {
    const e = new Error(`Invalid configured sizes: ${invalid.join(", ")}. Add or activate these sizes in Settings → Sizes.`);
    e.status = 400;
    throw e;
  }
  return normalized;
}


const PRODUCT_SORTS = new Set([
  "createdAt", "-createdAt", "name", "-name", "sellingPrice", "-sellingPrice",
  "discountedPrice", "-discountedPrice", "stockQuantity", "-stockQuantity"
]);

function listParam(value) {
  if (Array.isArray(value)) return value.flatMap(x => String(x).split(",")).map(x => x.trim()).filter(Boolean);
  if (value == null || value === "") return [];
  return String(value).split(",").map(x => x.trim()).filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSort(value, fallback = "-createdAt") {
  const candidate = String(value || fallback);
  return PRODUCT_SORTS.has(candidate) ? candidate : fallback;
}

async function matchingVariantProductIds(tenantId, query) {
  const hasVariantFilter = Object.keys(query).length > 0;
  if (!hasVariantFilter) return null;
  const variants = await ProductVariant.find({ tenantId, ...query }).select("productId").lean();
  return [...new Set(variants.map(v => String(v.productId)))];
}

function addProductFilters(filter, query, { admin = false } = {}) {
  const {
    category, collection, brand, subcategory, fabric, pattern, occasion, season,
    tags, featured, newArrival, available, offer, demanded,
    minPrice, maxPrice, minStock, maxStock
  } = query;

  if (category) filter.category = category;
  if (collection) filter.collections = collection;
  if (brand) filter.brand = brand;
  if (subcategory) filter.subcategory = subcategory;
  if (fabric) filter.fabric = fabric;
  if (pattern) filter.pattern = pattern;
  if (occasion) filter.occasion = occasion;
  if (season) filter.season = season;

  const tagList = listParam(tags);
  if (tagList.length) filter.tags = { $in: tagList };

  if (featured === "true") filter.isFeatured = true;
  if (newArrival === "true") filter.isNewArrival = true;
  if (available === "true") { filter.isAvailable = true; filter.$expr = { $gt: [{ $subtract: ["$stockQuantity", "$reservedQuantity"] }, 0] }; }
  if (available === "false") filter.isAvailable = false;
  if (offer === "true") filter.isTodaysOffer = true;
  if (demanded === "true") filter.isMostDemanded = true;

  const min = Number(minPrice);
  const max = Number(maxPrice);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    // Effective selling price: discounted price when present, otherwise selling price.
    filter.$expr = {
      $and: [
        ...(filter.$expr?.$and || []),
        ...(Number.isFinite(min) ? [{ $gte: [{ $ifNull: ["$discountedPrice", "$sellingPrice"] }, min] }] : []),
        ...(Number.isFinite(max) ? [{ $lte: [{ $ifNull: ["$discountedPrice", "$sellingPrice"] }, max] }] : [])
      ]
    };
  }

  const stockMin = Number(minStock);
  const stockMax = Number(maxStock);
  if (Number.isFinite(stockMin) || Number.isFinite(stockMax)) {
    filter.stockQuantity = {};
    if (Number.isFinite(stockMin)) filter.stockQuantity.$gte = stockMin;
    if (Number.isFinite(stockMax)) filter.stockQuantity.$lte = stockMax;
  }
}

export async function listPublic(req, res) {
  const { q, size, color, barcode, page = 1, limit = 12 } = req.query;
  const filter = { tenantId: req.tenant._id };

  if (q) filter.$text = { $search: q };
  addProductFilters(filter, req.query);

  const variantQuery = {};
  const sizes = listParam(size);
  const colors = listParam(color);
  if (sizes.length) variantQuery.size = { $in: sizes };
  if (colors.length) variantQuery.color = { $in: colors };
  if (barcode) variantQuery.barcode = new RegExp(escapeRegex(barcode), "i");

  // Variant filters must never be applied globally. Resolve matching product IDs
  // inside the authenticated public tenant first.
  if (Object.keys(variantQuery).length) {
    const ids = await matchingVariantProductIds(req.tenant._id, variantQuery);
    filter._id = { $in: ids };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const pageNum = Math.max(Number(page) || 1, 1);
  const skip = (pageNum - 1) * safeLimit;
  const sort = normalizeSort(req.query.sort);

  const [items, total] = await Promise.all([
    Product.find(filter)
      .select("+sellingPrice +discountedPrice")
      .populate("category", "name slug")
      .populate("collections", "name slug")
      .populate("sizeChartId", "name description sizes measurements")
      .sort(sort).skip(skip).limit(safeLimit).lean(),
    Product.countDocuments(filter)
  ]);

  res.json({
    items: items.map(publicProduct),
    pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
  });
}

export async function getPublic(req, res) {
  const p = await Product.findOne({ tenantId: req.tenant._id, slug: req.params.slug }).select("+sellingPrice +discountedPrice").populate("category", "name slug").populate("collections", "name slug")
    .populate("sizeChartId", "name description sizes measurements").lean();
  if (!p) return res.status(404).json({ message: "Product not found" });
  const variants = p.variantEnabled
    ? await ProductVariant.find({ tenantId: req.tenant._id, productId: p._id, isAvailable: true, stockQuantity: { $gt: 0 }, $expr: { $gt: [{ $subtract: ["$stockQuantity", "$reservedQuantity"] }, 0] } })
        .select("+sellingPrice +discountedPrice").sort({ createdAt: 1 }).lean()
    : [];
  res.json(publicProduct(p, variants));
}

export async function listAdmin(req, res) {
  const { q, size, color, barcode, page = 1, limit = 20 } = req.query;
  const filter = { tenantId: req.tenant._id };

  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: rx }, { sku: rx }, { brand: rx }, { subcategory: rx }];
  }
  addProductFilters(filter, req.query, { admin: true });

  const variantQuery = {};
  const sizes = listParam(size);
  const colors = listParam(color);
  if (sizes.length) variantQuery.size = { $in: sizes };
  if (colors.length) variantQuery.color = { $in: colors };
  if (barcode) variantQuery.barcode = new RegExp(escapeRegex(barcode), "i");

  if (Object.keys(variantQuery).length) {
    const ids = await matchingVariantProductIds(req.tenant._id, variantQuery);
    filter._id = { $in: ids };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pageNum = Math.max(Number(page) || 1, 1);
  const sort = normalizeSort(req.query.sort);

  const [items, total] = await Promise.all([
    Product.find(filter)
      .select("+purchasePrice +sellingPrice +discountedPrice")
      .populate("category", "name slug")
      .populate("collections", "name slug")
      .populate("sizeChartId", "name description sizes measurements")
      .sort(sort).skip((pageNum - 1) * safeLimit).limit(safeLimit).lean(),
    Product.countDocuments(filter)
  ]);

  res.json({
    items: items.map(adminProduct),
    pagination: { page: pageNum, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
  });
}

export async function getAdmin(req, res) {
  const p = await Product.findOne({ _id: req.params.id, tenantId: req.tenant._id }).select("+purchasePrice +sellingPrice +discountedPrice").populate("category", "name slug").populate("collections", "name slug")
    .populate("sizeChartId", "name description sizes measurements");
  if (!p) return res.status(404).json({ message: "Product not found" });
  const variants = await ProductVariant.find({ tenantId: req.tenant._id, productId: p._id })
    .select("+purchasePrice +sellingPrice +discountedPrice").sort({ createdAt: 1 }).lean();
  res.json({ ...adminProduct(p), variants });
}

async function uploadMediaFiles(files, tenantId) {
  const uploaded = [];
  for (let index = 0; index < (files || []).length; index++) {
    const file = files[index];
    const isVideo = file.mimetype.startsWith("video/");
    const result = await uploadBuffer(file.buffer, {
      folder: `dress-saas/${tenantId}/${isVideo ? "videos" : "images"}`,
      resourceType: isVideo ? "video" : "image"
    });
    uploaded.push({
      token: `new:${index}`,
      type: isVideo ? "video" : "image",
      media: {
        publicId: result.public_id,
        secureUrl: result.secure_url,
        resourceType: isVideo ? "video" : "image",
        format: result.format,
        width: result.width,
        height: result.height,
        duration: result.duration,
        bytes: Number(result.bytes || 0)
      }
    });
  }
  return uploaded;
}

function orderMedia(existing, uploaded, order, type) {
  const existingMap = new Map(existing.map(m => [m.publicId, m]));
  const uploadedMap = new Map(uploaded.filter(x => x.type === type).map(x => [x.token, x.media]));

  // When the client sends an order array, it is authoritative.
  // This is important for deletion: an existing media item omitted from the
  // array was intentionally removed in the editor and must not be re-added.
  if (Array.isArray(order)) {
    const result = [];
    const used = new Set();
    for (const key of order.filter(Boolean)) {
      let media = null;
      if (key.startsWith("existing:")) {
        media = existingMap.get(key.slice(9));
      } else if (key.startsWith("new:")) {
        media = uploadedMap.get(key);
      }
      if (media && !used.has(media.publicId)) {
        result.push(media);
        used.add(media.publicId);
      }
    }
    return result;
  }

  // Backward-compatible fallback for older clients that did not send an order.
  return [
    ...existing,
    ...uploaded.filter(x => x.type === type).map(x => x.media)
  ];
}

export async function create(req, res) {
  const body = JSON.parse(req.body.data || "{}");
  const { mediaOrder, ...productBody } = body;
  const input = productInput.parse(productBody);
  if (!(await Category.exists({ _id: input.category, tenantId: req.tenant._id }))) return res.status(400).json({ message: "Invalid category" });
  input.sizeChartId = await validateSizeChart(req.tenant._id, input.sizeChartId);
  input.sizes = await validateProductSizes(req.tenant._id, input.sizes);
  const collectionIds = [...new Set((input.collections || []).filter(id => mongoose.isValidObjectId(id)).map(String))];
  if (collectionIds.length !== (input.collections || []).length || (collectionIds.length && await Collection.countDocuments({ tenantId: req.tenant._id, _id: { $in: collectionIds } }) !== collectionIds.length)) {
    return res.status(400).json({ message: "One or more collections are invalid." });
  }
  input.collections = collectionIds;
  const product = new Product({ ...input, tenantId: req.tenant._id, slug: await uniqueSlug(input.name, null, req.tenant._id) });
  const uploaded = await uploadMediaFiles(req.files || [], req.tenant._id);
  product.images = orderMedia([], uploaded, mediaOrder?.images, "image");
  product.videos = orderMedia([], uploaded, mediaOrder?.videos, "video");
  await product.save();
  if (product.collections?.length) {
    await Collection.updateMany(
      { tenantId: req.tenant._id, _id: { $in: product.collections } },
      { $addToSet: { products: product._id } }
    );
  }
  res.status(201).json(adminProduct(await Product.findOne({ _id: product._id, tenantId: req.tenant._id }).select("+purchasePrice +sellingPrice +discountedPrice").populate("category", "name slug")));
}

export async function update(req, res) {
  const existing = await Product.findOne({ _id: req.params.id, tenantId: req.tenant._id }).select("+purchasePrice +sellingPrice +discountedPrice");
  if (!existing) return res.status(404).json({ message: "Product not found" });
  const body = JSON.parse(req.body.data || "{}");
  const { mediaOrder, ...productBody } = body;
  const input = productInput.parse(productBody);
  if (!(await Category.exists({ _id: input.category, tenantId: req.tenant._id }))) return res.status(400).json({ message: "Invalid category" });
  input.sizeChartId = await validateSizeChart(req.tenant._id, input.sizeChartId);
  input.sizes = await validateProductSizes(req.tenant._id, input.sizes);
  const collectionIds = [...new Set((input.collections || []).filter(id => mongoose.isValidObjectId(id)).map(String))];
  if (collectionIds.length !== (input.collections || []).length || (collectionIds.length && await Collection.countDocuments({ tenantId: req.tenant._id, _id: { $in: collectionIds } }) !== collectionIds.length)) {
    return res.status(400).json({ message: "One or more collections are invalid." });
  }
  input.collections = collectionIds;

  const oldImages = [...existing.images];
  const oldVideos = [...existing.videos];
  Object.assign(existing, input);
  existing.slug = await uniqueSlug(input.name, existing._id, req.tenant._id);

  const uploaded = await uploadMediaFiles(req.files || [], req.tenant._id);
  const nextImages = orderMedia(oldImages, uploaded, mediaOrder?.images, "image");
  const nextVideos = orderMedia(oldVideos, uploaded, mediaOrder?.videos, "video");

  const keepImageIds = new Set(nextImages.map(m => m.publicId));
  const keepVideoIds = new Set(nextVideos.map(m => m.publicId));
  await Promise.all([
    ...oldImages.filter(m => !keepImageIds.has(m.publicId)).map(m => destroyAsset(m.publicId, "image")),
    ...oldVideos.filter(m => !keepVideoIds.has(m.publicId)).map(m => destroyAsset(m.publicId, "video"))
  ]);

  existing.images = nextImages;
  existing.videos = nextVideos;
  await existing.save();

  // Keep the denormalized Collection.products list in sync with Product.collections.
  await Collection.updateMany(
    { tenantId: req.tenant._id, products: existing._id, _id: { $nin: existing.collections || [] } },
    { $pull: { products: existing._id } }
  );
  if ((existing.collections || []).length) {
    await Collection.updateMany(
      { tenantId: req.tenant._id, _id: { $in: existing.collections } },
      { $addToSet: { products: existing._id } }
    );
  }
  res.json(adminProduct(await Product.findOne({ _id: existing._id, tenantId: req.tenant._id }).select("+purchasePrice +sellingPrice +discountedPrice").populate("category", "name slug")));
}

export async function remove(req, res) {
  const p = await Product.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!p) return res.status(404).json({ message: "Product not found" });
  await Promise.all([
    ProductVariant.deleteMany({ tenantId: req.tenant._id, productId: p._id }),
    Collection.updateMany({ tenantId: req.tenant._id, products: p._id }, { $pull: { products: p._id } }),
    ...p.images.map(m => destroyAsset(m.publicId, "image")),
    ...p.videos.map(m => destroyAsset(m.publicId, "video"))
  ]);
  await p.deleteOne();
  res.json({ message: "Product deleted successfully" });
}

export async function deleteMedia(req, res) {
  const p = await Product.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!p) return res.status(404).json({ message: "Product not found" });
  const { type, publicId } = req.body;
  const field = type === "video" ? "videos" : "images";
  const media = p[field].find(m => m.publicId === publicId);
  if (!media) return res.status(404).json({ message: "Media not found" });
  await destroyAsset(publicId, type === "video" ? "video" : "image");
  p[field] = p[field].filter(m => m.publicId !== publicId);
  await p.save();
  res.json({ message: "Media deleted" });
}
