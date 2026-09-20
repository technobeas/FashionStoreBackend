import mongoose from "mongoose";
import Collection from "../models/Collection.js";
import Product from "../models/Product.js";
import { slugify } from "../utils/slug.js";
import { uploadBuffer, destroyAsset } from "../services/cloudinaryService.js";
import { publicProduct } from "../utils/publicProduct.js";

async function uniqueSlug(name, id, tenantId) {
  const base = slugify(name);
  let slug = base || `collection-${Date.now()}`;
  let n = 1;
  while (await Collection.exists({ tenantId, slug, ...(id ? { _id: { $ne: id } } : {}) })) {
    slug = `${base || "collection"}-${n++}`;
  }
  return slug;
}

function cleanProductIds(ids = []) {
  let values = ids;
  if (typeof values === "string") {
    try { values = JSON.parse(values); } catch { values = values.split(",").map(v => v.trim()).filter(Boolean); }
  }
  if (!Array.isArray(values)) values = [];
  return [...new Set(values.filter(id => mongoose.isValidObjectId(id)).map(String))];
}

async function syncProductsForCollection(tenantId, collectionId, productIds) {
  const ids = cleanProductIds(productIds);
  const valid = ids.length
    ? await Product.find({ tenantId, _id: { $in: ids } }).select("_id").lean()
    : [];
  const validIds = valid.map(p => p._id);

  await Product.updateMany(
    { tenantId, collections: collectionId, _id: { $nin: validIds } },
    { $pull: { collections: collectionId } }
  );
  if (validIds.length) {
    await Product.updateMany(
      { tenantId, _id: { $in: validIds } },
      { $addToSet: { collections: collectionId } }
    );
  }
  return validIds;
}

function serialize(c) {
  const x = c.toObject ? c.toObject() : c;
  return {
    ...x,
    productCount: Array.isArray(x.products) ? x.products.length : (x.productCount || 0)
  };
}

export async function list(req, res) {
  const activeOnly = req.query.active !== "false";
  const filter = { tenantId: req.tenant._id, ...(activeOnly ? { isActive: true } : {}) };
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const [collections, total] = await Promise.all([
    Collection.find(filter)
      .populate({ path: "products", select: "name slug sku images isAvailable", match: { tenantId: req.tenant._id }, options: { sort: { createdAt: -1 } } })
      .sort({ sortOrder: 1, name: 1 })
      .skip(skip).limit(limit).lean(),
    Collection.countDocuments(filter)
  ]);

  res.json({
    items: collections.map(serialize),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
}

export async function getPublic(req, res) {
  const collection = await Collection.findOne({
    tenantId: req.tenant._id,
    slug: req.params.slug,
    isActive: true
  }).select("name slug description image sortOrder").lean();

  if (!collection) return res.status(404).json({ message: "Collection not found" });

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
  const filter = { tenantId: req.tenant._id, collections: collection._id, isAvailable: true };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select("+sellingPrice +discountedPrice")
      .populate("category", "name slug")
      .populate("collections", "name slug")
      .sort({ isFeatured: -1, isNewArrival: -1, createdAt: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter)
  ]);

  res.json({
    collection,
    products: products.map(p => publicProduct(p)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
}

async function uploadImage(file, tenantId) {
  if (!file) return null;
  const result = await uploadBuffer(file.buffer, {
    folder: `dress-saas/${tenantId}/collections`,
    resourceType: "image"
  });
  return { publicId: result.public_id, secureUrl: result.secure_url };
}

export async function create(req, res) {
  const {
    name,
    description = "",
    isActive = true,
    sortOrder = 0,
    productIds = []
  } = req.body;

  if (!name?.trim()) return res.status(400).json({ message: "Collection name is required." });

  const products = cleanProductIds(productIds);
  const validProducts = products.length
    ? await Product.find({ tenantId: req.tenant._id, _id: { $in: products } }).select("_id").lean()
    : [];
  const validProductIds = validProducts.map(p => p._id);
  const image = await uploadImage(req.file, req.tenant._id);
  const collection = await Collection.create({
    tenantId: req.tenant._id,
    name: name.trim(),
    slug: await uniqueSlug(name, null, req.tenant._id),
    description,
    isActive: isActive === true || isActive === "true",
    sortOrder: Number(sortOrder) || 0,
    products: validProductIds
  });

  await syncProductsForCollection(req.tenant._id, collection._id, validProductIds);
  await collection.save();

  const fresh = await Collection.findOne({ _id: collection._id, tenantId: req.tenant._id })
    .populate("products", "name slug sku images isAvailable");
  res.status(201).json(serialize(fresh));
}

export async function update(req, res) {
  const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!collection) return res.status(404).json({ message: "Collection not found." });

  const {
    name,
    description,
    isActive,
    sortOrder,
    productIds
  } = req.body;

  if (name?.trim()) {
    collection.name = name.trim();
    collection.slug = await uniqueSlug(name, collection._id, req.tenant._id);
  }
  if (description !== undefined) collection.description = String(description);
  if (isActive !== undefined) collection.isActive = isActive === true || isActive === "true";
  if (sortOrder !== undefined) collection.sortOrder = Number(sortOrder) || 0;

  if (req.file) {
    const old = collection.image?.publicId;
    collection.image = await uploadImage(req.file, req.tenant._id);
    if (old) await destroyAsset(old, "image");
  } else if (req.body.removeImage === "true") {
    const old = collection.image?.publicId;
    collection.image = undefined;
    if (old) await destroyAsset(old, "image");
  }

  if (productIds !== undefined) {
    const requestedIds = cleanProductIds(productIds);
    const validProducts = requestedIds.length
      ? await Product.find({ tenantId: req.tenant._id, _id: { $in: requestedIds } }).select("_id").lean()
      : [];
    collection.products = validProducts.map(p => p._id);
  }

  await collection.save();

  if (productIds !== undefined) {
    await syncProductsForCollection(req.tenant._id, collection._id, collection.products);
  }

  const fresh = await Collection.findOne({ _id: collection._id, tenantId: req.tenant._id })
    .populate("products", "name slug sku images isAvailable");
  res.json(serialize(fresh));
}

export async function remove(req, res) {
  const collection = await Collection.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!collection) return res.status(404).json({ message: "Collection not found." });

  await Product.updateMany(
    { tenantId: req.tenant._id, collections: collection._id },
    { $pull: { collections: collection._id } }
  );

  if (collection.image?.publicId) await destroyAsset(collection.image.publicId, "image");
  await collection.deleteOne();

  res.json({ message: "Collection deleted successfully." });
}
