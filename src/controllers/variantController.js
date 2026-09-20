import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import FashionSize from "../models/FashionSize.js";
import { z } from "zod";

const variantInput = z.object({
  _id: z.string().optional(),
  sku: z.string().trim().min(1).max(80),
  size: z.string().trim().max(50).optional().default(""),
  color: z.string().trim().max(50).optional().default(""),
  colorCode: z.string().trim().max(20).optional().default(""),
  barcode: z.string().trim().max(80).optional().default(""),
  image: z.object({ publicId: z.string(), secureUrl: z.string(), bytes: z.number().nonnegative().optional().default(0) }).optional().nullable().default(null),
  stockQuantity: z.number().int().nonnegative(),
  purchasePrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  discountedPrice: z.number().nonnegative().nullable().optional().default(null),
  isAvailable: z.boolean().default(true)
}).superRefine((v, ctx) => {
  if (v.discountedPrice != null && v.discountedPrice >= v.sellingPrice) {
    ctx.addIssue({ code: "custom", path: ["discountedPrice"], message: "Discounted price must be lower than selling price." });
  }
});

function serialize(v, includeCost = false) {
  const p = v.toObject ? v.toObject() : v;
  const out = {
    _id: p._id, productId: p.productId, sku: p.sku,
    size: p.size || "", color: p.color || "", colorCode: p.colorCode || "", barcode: p.barcode || "", image: p.image || null,
    stockQuantity: p.stockQuantity,
    sellingPrice: p.sellingPrice,
    discountedPrice: p.discountedPrice ?? null,
    isAvailable: p.isAvailable,
    createdAt: p.createdAt, updatedAt: p.updatedAt
  };
  if (includeCost) out.purchasePrice = p.purchasePrice;
  return out;
}

export async function listAdmin(req, res) {
  const product = await Product.findOne({ _id: req.params.productId, tenantId: req.tenant._id }).select("_id");
  if (!product) return res.status(404).json({ message: "Product not found" });
  const items = await ProductVariant.find({ tenantId: req.tenant._id, productId: product._id })
    .select("+purchasePrice +sellingPrice +discountedPrice").sort({ createdAt: 1 }).lean();
  res.json({ items: items.map(v => serialize(v, true)) });
}

export async function listPublic(req, res) {
  const product = await Product.findOne({ _id: req.params.productId, tenantId: req.tenant._id }).select("_id isPriceVisible");
  if (!product) return res.status(404).json({ message: "Product not found" });
  const items = await ProductVariant.find({ tenantId: req.tenant._id, productId: product._id, isAvailable: true, stockQuantity: { $gt: 0 } })
    .select("+sellingPrice +discountedPrice").sort({ createdAt: 1 }).lean();
  res.json({
    items: items.map(v => {
      const x = serialize(v);
      if (!product.isPriceVisible) {
        delete x.sellingPrice; delete x.discountedPrice;
      }
      return x;
    })
  });
}

export async function replace(req, res) {
  const product = await Product.findOne({ _id: req.params.productId, tenantId: req.tenant._id });
  if (!product) return res.status(404).json({ message: "Product not found" });

  const parsed = z.object({ variants: z.array(variantInput).max(500) }).parse(req.body);
  const requestedSizes = [...new Set(parsed.variants.map(v => String(v.size || "").trim().toUpperCase()).filter(Boolean))];
  if (requestedSizes.length) {
    const foundSizes = await FashionSize.find({ tenantId: req.tenant._id, key: { $in: requestedSizes }, isActive: true }).select("key").lean();
    const allowed = new Set(foundSizes.map(x => x.key));
    const invalid = requestedSizes.filter(x => !allowed.has(x));
    if (invalid.length) return res.status(400).json({ message: `Invalid configured sizes: ${invalid.join(", ")}. Configure them in Settings → Sizes.` });
  }
  const normalized = parsed.variants.map(v => ({ ...v, sku: v.sku.toUpperCase(), size: String(v.size || "").trim().toUpperCase(), color: v.color || "", colorCode: v.colorCode || "", barcode: v.barcode || "", image: v.image || null }));

  const seenSku = new Set();
  const seenBarcode = new Set();
  const seenCombination = new Set();
  for (const v of normalized) {
    if (seenSku.has(v.sku)) return res.status(400).json({ message: `Duplicate variant SKU: ${v.sku}` });
    seenSku.add(v.sku);
    if (v.barcode) {
      if (seenBarcode.has(v.barcode)) return res.status(400).json({ message: `Duplicate variant barcode: ${v.barcode}` });
      seenBarcode.add(v.barcode);
    }
    const combo = `${v.size.toLowerCase()}::${v.color.toLowerCase()}`;
    if (seenCombination.has(combo)) return res.status(400).json({ message: "Duplicate size/color combination in variants." });
    seenCombination.add(combo);
  }

  const existing = await ProductVariant.find({ tenantId: req.tenant._id, productId: product._id }).select("_id");
  const keepIds = new Set();

  for (const item of normalized) {
    if (item._id) {
      const current = await ProductVariant.findOne({ _id: item._id, tenantId: req.tenant._id, productId: product._id });
      if (!current) return res.status(400).json({ message: "Invalid variant." });
      Object.assign(current, item);
      await current.save();
      keepIds.add(String(current._id));
    } else {
      const created = await ProductVariant.create({ ...item, tenantId: req.tenant._id, productId: product._id });
      keepIds.add(String(created._id));
    }
  }

  const removeIds = existing.map(x => x._id).filter(id => !keepIds.has(String(id)));
  if (removeIds.length) await ProductVariant.deleteMany({ _id: { $in: removeIds }, tenantId: req.tenant._id, productId: product._id });

  product.variantEnabled = normalized.length > 0;
  if (normalized.length) {
    product.stockQuantity = normalized.reduce((sum, v) => sum + v.stockQuantity, 0);
    product.isAvailable = normalized.some(v => v.isAvailable && v.stockQuantity > 0);
  }
  await product.save();

  const items = await ProductVariant.find({ tenantId: req.tenant._id, productId: product._id })
    .select("+purchasePrice +sellingPrice +discountedPrice").sort({ createdAt: 1 }).lean();
  res.json({ items: items.map(v => serialize(v, true)), variantEnabled: product.variantEnabled, stockQuantity: product.stockQuantity, isAvailable: product.isAvailable });
}
