import AuditLog from "../models/AuditLog.js";

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "ACTION"];

export async function list(req, res) {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const filter = { tenantId: req.tenant._id };

  if (req.query.action && ACTIONS.includes(req.query.action)) filter.action = req.query.action;
  if (req.query.entity) filter.entity = String(req.query.entity).trim().slice(0, 80);
  if (req.query.actorId) filter.actorId = req.query.actorId;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) {
      const from = new Date(req.query.from);
      if (!Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
    }
    if (req.query.to) {
      const to = new Date(req.query.to);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }
    if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
  }

  if (!req.query.from && !req.query.to && req.query.all !== "1") filter.createdAt = { $gte: new Date(Date.now() - 86400000) };

  if (req.query.q) {
    const q = String(req.query.q).trim().slice(0, 120);
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { actorUsername: { $regex: escaped, $options: "i" } },
        { entity: { $regex: escaped, $options: "i" } },
        { entityId: { $regex: escaped, $options: "i" } },
        { path: { $regex: escaped, $options: "i" } }
      ];
    }
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter)
  ]);

  res.json({
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
}

export async function summary(req, res) {
  const tenantId = req.tenant._id;
  const since = !req.query.from && !req.query.to && req.query.all !== "1" ? new Date(Date.now() - 86400000) : (req.query.from ? new Date(req.query.from) : null);
  const match = { tenantId, ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { $gte: since } } : {}) };
  if (req.query.to) { const to = new Date(req.query.to); if (!Number.isNaN(to.getTime())) { to.setHours(23,59,59,999); match.createdAt = { ...(match.createdAt||{}), $lte: to }; } }
  const [actions, entities, actors] = await Promise.all([
    AuditLog.aggregate([
      { $match: match },
      { $group: { _id: "$action", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    AuditLog.aggregate([
      { $match: match },
      { $group: { _id: "$entity", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 }
    ]),
    AuditLog.aggregate([
      { $match: match },
      { $group: { _id: "$actorUsername", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 }
    ])
  ]);

  res.json({
    total: await AuditLog.countDocuments(match),
    actions,
    entities,
    actors
  });
}
