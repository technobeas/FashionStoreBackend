import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: "Notification", required: true, index: true },
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null, index: true },
    endpoint: { type: String, required: true },
    status: { type: String, enum: ["success", "failed"], required: true },
    errorCode: { type: Number, default: null },
    errorMessage: { type: String, default: "" },
    sentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

schema.index({ tenantId: 1, notificationId: 1, endpoint: 1 }, { unique: true });
schema.index({ tenantId: 1, notificationId: 1, status: 1 });
schema.index({ tenantId: 1, campaignId: 1, status: 1 });

export default mongoose.model("NotificationDelivery", schema);
