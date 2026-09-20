import InventoryTransaction from "../models/InventoryTransaction.js";

/**
 * Append-only inventory ledger entry.
 *
 * Stock mutations remain owned by the business operation that performs them.
 * This service records the resulting before/change/after snapshot so every
 * movement has an auditable explanation without duplicating stock mutation
 * logic across controllers.
 */
export async function recordInventoryTransaction({
  tenantId,
  product,
  variant = null,
  productName,
  sku,
  type,
  quantityBefore,
  quantityChange,
  quantityAfter,
  referenceType = "Manual",
  referenceId = null,
  note = "",
  createdBy = null
}) {
  if (!tenantId || !product) throw new Error("Inventory transaction requires tenant and product.");
  if (!Number.isFinite(Number(quantityBefore)) || Number(quantityBefore) < 0) throw new Error("Invalid inventory quantityBefore.");
  if (!Number.isFinite(Number(quantityChange))) throw new Error("Invalid inventory quantityChange.");
  if (!Number.isFinite(Number(quantityAfter)) || Number(quantityAfter) < 0) throw new Error("Invalid inventory quantityAfter.");

  return InventoryTransaction.create({
    tenantId,
    product,
    variant,
    productName: String(productName || "").trim(),
    sku: String(sku || "").trim().toUpperCase(),
    type,
    quantityBefore: Number(quantityBefore),
    quantityChange: Number(quantityChange),
    quantityAfter: Number(quantityAfter),
    referenceType,
    referenceId,
    note: String(note || "").trim(),
    createdBy
  });
}
