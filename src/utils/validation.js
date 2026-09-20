import { z } from "zod";

export const productInput = z.object({
  name: z.string().min(2).max(160),
  sku: z.string().min(1).max(80),
  category: z.string().min(1),
  collections: z.array(z.string().min(1)).max(30).optional().default([]),
  brand: z.string().trim().max(120).optional().default(""),
  subcategory: z.string().trim().max(120).optional().default(""),
  fabric: z.string().trim().max(120).optional().default(""),
  pattern: z.string().trim().max(120).optional().default(""),
  occasion: z.string().trim().max(120).optional().default(""),
  season: z.string().trim().max(120).optional().default(""),
  tags: z.array(z.string().trim().min(1).max(50)).max(50).optional().default([]),
  careInstructions: z.string().max(5000).optional().default(""),
  sizeChartId: z.string().optional().nullable().default(null),
  sizeChart: z.object({
    name: z.string().trim().max(120).optional().default(""),
    measurements: z.record(z.string(), z.string().trim().max(80)).optional().default({})
  }).optional().default({ name: "", measurements: {} }),
  isFeatured: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),
  seoTitle: z.string().trim().max(160).optional().default(""),
  seoDescription: z.string().trim().max(320).optional().default(""),
  description: z.string().max(10000).optional().default(""),
  stockQuantity: z.number().int().nonnegative().default(1),
  variantEnabled: z.boolean().default(false),
  colors: z.array(z.string().trim().min(1).max(50)).default([]),
  sizes: z.array(z.string().trim().min(1).max(50)).default([]),
  specifications: z.record(z.string(), z.string()).optional().default({}),
  purchasePrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  discountedPrice: z.number().nonnegative().nullable().optional(),
  isPriceVisible: z.boolean().default(true),
  isAvailable: z.boolean().default(true),
  isTodaysOffer: z.boolean().default(false),
  isMostDemanded: z.boolean().default(false)
}).superRefine((v, ctx) => {
  if (v.discountedPrice != null && v.discountedPrice >= v.sellingPrice) {
    ctx.addIssue({ code: "custom", path: ["discountedPrice"], message: "Discounted price must be lower than selling price." });
  }
});
