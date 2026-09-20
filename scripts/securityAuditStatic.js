import fs from "node:fs";
import path from "node:path";

const root = path.resolve(decodeURIComponent(new URL("../", import.meta.url).pathname));
const controllersDir = path.join(root, "src", "controllers");
const modelsDir = path.join(root, "src", "models");

const platformModels = new Set(["Tenant.js", "SaaSPlan.js", "BillingEvent.js"]);
const failures = [];
const warnings = [];

for (const file of fs.readdirSync(modelsDir).filter((x) => x.endsWith(".js"))) {
  if (platformModels.has(file)) continue;
  const source = fs.readFileSync(path.join(modelsDir, file), "utf8");
  if (!/\btenantId\s*:/.test(source)) {
    failures.push(`Model ${file} does not declare tenantId.`);
  }
}

for (const file of fs.readdirSync(controllersDir).filter((x) => x.endsWith(".js"))) {
  const source = fs.readFileSync(path.join(controllersDir, file), "utf8");
  const hasTenantContext = source.includes("req.tenant._id") || source.includes("req.tenant?.") || source.includes("req.tenantId");
  const hasMongooseAccess = /\b(?:find|findOne|findById|findOneAndUpdate|findOneAndDelete|updateOne|deleteOne|countDocuments|aggregate|exists)\s*\(/.test(source);
  if (hasMongooseAccess && !hasTenantContext && !["superAdminController.js"].includes(file)) {
    warnings.push(`Review ${file}: database access found without an obvious req.tenant scope.`);
  }
}

console.log(JSON.stringify({
  phase: 29,
  name: "Security / Tenant Isolation Audit v2",
  modelChecks: failures.length === 0 ? "PASS" : "FAIL",
  failures,
  warnings
}, null, 2));

if (failures.length) process.exitCode = 1;
