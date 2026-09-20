import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    image: { type: String, default: "" },
    url: { type: String, default: "/" },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    collection: { type: mongoose.Schema.Types.ObjectId, ref: "Collection", default: null },
    kind: {
      type: String,
      enum: ["general", "promotion", "low_stock", "offer", "new_arrival"],
      default: "general",
      index: true
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sending", "sent", "partial", "failed", "cancelled"],
      default: "draft",
      index: true
    },
    scheduledFor: { type: Date, default: null, index: true },
    nextAttemptAt: { type: Date, default: null, index: true },
    processingStartedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastError: { type: String, default: "" },
    recipientCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

schema.index({ tenantId: 1, status: 1, scheduledFor: 1 });
schema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model("Notification", schema);
