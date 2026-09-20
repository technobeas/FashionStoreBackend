import Category from "../models/Category.js";
import { slugify } from "../utils/slug.js";
import Product from "../models/Product.js";
import { uploadBuffer, destroyAsset } from "../services/cloudinaryService.js";

export async function list(req, res) {
  const activeOnly = req.query.active !== "false";
  const filter = { tenantId: req.tenant._id, ...(activeOnly ? { isActive: true } : {}) };
  const pageNum = Math.max(Number(req.query.page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const skip = (pageNum - 1) * safeLimit;

  const [cats, total, counts] = await Promise.all([
    Category.find(filter).sort({ sortOrder: 1, name: 1 }).skip(skip).limit(safeLimit).lean(),
    Category.countDocuments(filter),
    Product.aggregate([{ $match: { tenantId: req.tenant._id } }, { $group: { _id: "$category", count: { $sum: 1 } } }])
  ]);

  const map = new Map(counts.map(x => [String(x._id), x.count]));
  const items = cats.map(c => ({ ...c, productCount: map.get(String(c._id)) || 0 }));

  res.json({
    items,
    pagination: {
      page: pageNum,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit)
    }
  });
}

async function uploadCategoryImage(file, tenantId) {
  if (!file) return null;
  const result = await uploadBuffer(file.buffer, { folder: `dress-saas/${tenantId}/categories`, resourceType: "image" });
  return { publicId: result.public_id, secureUrl: result.secure_url };
}

export async function create(req, res) {
  const { name, description = "", isActive = true, sortOrder = 0 } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Category name is required" });
  const image = await uploadCategoryImage(req.file, req.tenant._id);
  const category = await Category.create({ tenantId: req.tenant._id, name: name.trim(), slug: slugify(name), description, image, isActive, sortOrder: Number(sortOrder) || 0 });
  res.status(201).json(category);
}

export async function update(req, res) {
  const category = await Category.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!category) return res.status(404).json({ message: "Category not found" });
  const { name, description, isActive, sortOrder, removeImage } = req.body;
  if (name?.trim()) { category.name = name.trim(); category.slug = slugify(name); }
  if (description !== undefined) category.description = description;
  if (isActive !== undefined) category.isActive = isActive === true || isActive === "true";
  if (sortOrder !== undefined) category.sortOrder = Number(sortOrder) || 0;

  if (req.file) {
    const old = category.image?.publicId;
    category.image = await uploadCategoryImage(req.file, req.tenant._id);
    if (old) await destroyAsset(old, "image");
  } else if (removeImage === "true") {
    const old = category.image?.publicId;
    category.image = undefined;
    if (old) await destroyAsset(old, "image");
  }

  await category.save();
  res.json(category);
}

export async function remove(req, res) {
  const category = await Category.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!category) return res.status(404).json({ message: "Category not found" });
  const count = await Product.countDocuments({ tenantId: req.tenant._id, category: req.params.id });
  if (count) return res.status(409).json({ message: "Move or delete products in this category first." });
  if (category.image?.publicId) await destroyAsset(category.image.publicId, "image");
  await category.deleteOne();
  res.json({ message: "Category deleted" });
}
