export const FEATURE_CATALOG = Object.freeze({
  catalog: { label: "Product Catalog", description: "Products, categories, variants and public catalog." },
  pos: { label: "POS & Billing", description: "Retail POS sales, invoices and billing." },
  customers: { label: "Customers", description: "Customer profiles, CRM and customer history." },
  inventory: { label: "Inventory", description: "Stock, inventory ledger and stock controls." },
  purchases: { label: "Purchases", description: "Purchase orders and supplier purchasing workflow." },
  suppliers: { label: "Suppliers", description: "Supplier management and supplier records." },
  reports: { label: "Reports", description: "Sales, purchase, return and financial reports." },
  expenses: { label: "Expenses", description: "Operating expense tracking and financial accounting." },
  staff: { label: "Staff & Permissions", description: "Staff accounts, roles and permissions." },
  sizes: { label: "Fashion Sizes", description: "Tenant size configurations and size charts." },
  collections: { label: "Collections", description: "Merchandising collections and product assignment." },
  online_orders: { label: "Online Orders", description: "Public storefront checkout and online order management." },
  notifications: { label: "Notifications", description: "Customer and staff notification center." },
  campaigns: { label: "Campaigns", description: "Marketing campaigns and scheduled messaging." },
  loyalty: { label: "Loyalty", description: "Points, tiers and loyalty redemption." },
  domains: { label: "Custom Domains", description: "Subdomains and custom storefront domains." },
  pwa: { label: "Offline PWA", description: "Offline retail/POS capabilities and synchronization." },
  seo: { label: "SEO & Discovery", description: "Sitemaps, robots, structured data and store discovery." },
  advanced_analytics: { label: "Advanced Analytics", description: "Advanced analytics and performance insights." }
});
export const FEATURE_KEYS = Object.freeze(Object.keys(FEATURE_CATALOG));
export function sanitizeFeatures(values = []) { return [...new Set((Array.isArray(values) ? values : []).map(String).filter(v => FEATURE_KEYS.includes(v)))]; }
