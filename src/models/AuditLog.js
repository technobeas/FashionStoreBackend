import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null, index: true },
    actorUsername: { type: String, default: "" },
    actorRole: { type: String, default: "" },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "ACTION"],
      required: true,
      index: true
    },
    entity: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, default: "", index: true },
    method: { type: String, default: "" },
    path: { type: String, default: "" },
    statusCode: { type: Number, default: 200 },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

schema.index({ tenantId: 1, createdAt: -1 });
schema.index({ tenantId: 1, entity: 1, createdAt: -1 });
schema.index({ tenantId: 1, actorId: 1, createdAt: -1 });
schema.index({ tenantId: 1, action: 1, createdAt: -1 });

export default mongoose.model("AuditLog", schema);
