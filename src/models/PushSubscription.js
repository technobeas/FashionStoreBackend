import mongoose from "mongoose";

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", default: null, index: true },
  endpoint: { type: String, required: true, index: true },
  expirationTime: Date,
  subscribedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  }
}, { timestamps: true });

export default mongoose.model("PushSubscription", schema);

schema.index({ tenantId: 1, endpoint: 1 }, { unique: true });
