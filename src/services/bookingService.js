import Booking from "../models/Booking.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import { recordInventoryTransaction } from "./inventoryService.js";

function bookingNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  return `BK-${stamp}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
}

export async function releaseExpiredBookings() {
  const expired = await Booking.find({ status: "active", expiresAt: { $lte: new Date() } }).limit(100).lean();
  let released = 0;
  for (const b of expired) {
    const updated = await Booking.findOneAndUpdate({ _id: b._id, status: "active" }, { $set: { status: "expired", releasedAt: new Date() } }, { new: true });
    if (!updated) continue;
    // Reservation is represented separately from physical stock.
    if (b.variant) {
      const v = await ProductVariant.findOneAndUpdate({ tenantId: b.tenantId, _id: b.variant, productId: b.product }, { $inc: { reservedQuantity: -b.quantity } }, { new: true });
      if (v) await Product.updateOne({ tenantId: b.tenantId, _id: b.product }, { $inc: { reservedQuantity: -b.quantity } });
    } else {
      await Product.updateOne({ tenantId: b.tenantId, _id: b.product }, { $inc: { reservedQuantity: -b.quantity } });
    }
    released++;
  }
  return released;
}

export async function startBookingWorker(intervalMs = 5 * 60 * 1000) {
  await releaseExpiredBookings().catch(() => {});
  const timer = setInterval(() => releaseExpiredBookings().catch(() => {}), intervalMs);
  return timer;
}

export { bookingNumber };
