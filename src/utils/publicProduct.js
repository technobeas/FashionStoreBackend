export function publicProduct(doc, variants = []) {
  const p = doc.toObject ? doc.toObject() : doc;
  const base = {
    _id: p._id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    category: p.category,
    collections: p.collections || [],
    brand: p.brand || "",
    subcategory: p.subcategory || "",
    fabric: p.fabric || "",
    pattern: p.pattern || "",
    occasion: p.occasion || "",
    season: p.season || "",
    tags: p.tags || [],
    careInstructions: p.careInstructions || "",
    sizeChartId: p.sizeChartId || null,
    sizeChart: p.sizeChartId || p.sizeChart || { name: "", measurements: {} },
    isFeatured: Boolean(p.isFeatured),
    isNewArrival: Boolean(p.isNewArrival),
    seoTitle: p.seoTitle || "",
    seoDescription: p.seoDescription || "",
    description: p.description,
    colors: p.colors || [],
    sizes: p.sizes || [],
    isPriceVisible: p.isPriceVisible,
    stockQuantity: Math.max(0, Number(p.stockQuantity || 0) - Number(p.reservedQuantity || 0)),
    isAvailable: Boolean(p.isAvailable) && (p.variantEnabled ? (variants || []).some(v => Number(v.stockQuantity || 0) - Number(v.reservedQuantity || 0) > 0) : (Number(p.stockQuantity || 0) - Number(p.reservedQuantity || 0) > 0)),
    isTodaysOffer: p.isTodaysOffer,
    isMostDemanded: p.isMostDemanded,
    images: p.images,
    videos: p.videos,
    variantEnabled: Boolean(p.variantEnabled),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
  if (variants?.length) {
    base.variants = variants.map(v => {
      const x = { _id: v._id, sku: v.sku, size: v.size || "", color: v.color || "", colorCode: v.colorCode || "", barcode: v.barcode || "", image: v.image || null, stockQuantity: Math.max(0, Number(v.stockQuantity || 0) - Number(v.reservedQuantity || 0)), isAvailable: Boolean(v.isAvailable) && (Number(v.stockQuantity || 0) - Number(v.reservedQuantity || 0) > 0) };
      if (p.isPriceVisible) { x.sellingPrice = v.sellingPrice; x.discountedPrice = v.discountedPrice ?? null; }
      return x;
    });
  }
  if (p.isPriceVisible) {
    base.sellingPrice = p.sellingPrice;
    base.discountedPrice = p.discountedPrice;
  }
  return base;
}

export function adminProduct(doc) {
  const p = doc.toObject ? doc.toObject() : doc;
  const normalProfit = p.sellingPrice - p.purchasePrice;
  const discountedProfit = p.discountedPrice != null ? p.discountedPrice - p.purchasePrice : null;
  return {
    ...p,
    normalProfit,
    discountedProfit,
    normalMargin: p.sellingPrice ? (normalProfit / p.sellingPrice) * 100 : 0,
    discountedMargin: p.discountedPrice ? (discountedProfit / p.discountedPrice) * 100 : null
  };
}
