const ROLE_PERMISSIONS = {
  owner: ["*"],
  super_admin: ["*"],
  admin: ["dashboard.view","reports.view","expenses.view","expenses.manage","products.view","products.create","products.edit","products.delete","sales.view","sales.create","customers.view","customers.create","customers.edit","suppliers.view","suppliers.create","suppliers.edit","purchases.view","purchases.create","inventory.view","inventory.adjust","returns.view","returns.create","categories.view","categories.create","categories.edit","collections.view","collections.create","collections.edit","collections.delete","notifications.view","notifications.create","audit.view","usage.view","billing.view","domains.view","domains.manage","settings.view","settings.edit","staff.view","loyalty.view","loyalty.manage","campaigns.view","campaigns.manage"],
  manager: ["dashboard.view","reports.view","expenses.view","expenses.manage","products.view","products.create","products.edit","products.delete","sales.view","sales.create","customers.view","customers.create","customers.edit","suppliers.view","suppliers.create","suppliers.edit","purchases.view","purchases.create","inventory.view","inventory.adjust","returns.view","returns.create","categories.view","categories.create","categories.edit","collections.view","collections.create","collections.edit","collections.delete","notifications.view","notifications.create","audit.view","usage.view","billing.view","domains.view","domains.manage","settings.view","staff.view","staff.manage","loyalty.view","loyalty.manage","campaigns.view","campaigns.manage"],
  sales: ["dashboard.view","reports.view","products.view","sales.view","sales.create","customers.view","customers.create","customers.edit","returns.view","returns.create","loyalty.view"],
  inventory: ["dashboard.view","reports.view","products.view","products.create","products.edit","suppliers.view","suppliers.create","suppliers.edit","purchases.view","purchases.create","inventory.view","inventory.adjust","categories.view","collections.view"],
  staff: ["dashboard.view","reports.view","products.view","sales.view","customers.view","loyalty.view"]
};

export function hasPermission(admin, permission) {
  if (!admin) return false;
  if (admin.role === "owner" || admin.role === "super_admin") return true;
  const permissions = Array.isArray(admin.permissions) && admin.permissions.length ? admin.permissions : (ROLE_PERMISSIONS[admin.role] || []);
  return permissions.includes("*") || permissions.includes(permission);
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.admin, permission)) return res.status(403).json({ message: "You do not have permission to perform this action." });
    next();
  };
}

export { ROLE_PERMISSIONS };
