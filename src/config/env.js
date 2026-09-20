import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CLIENT_URL: z.string().url(),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
  ADMIN_USERNAME: z.string().min(3),
  ADMIN_PASSWORD: z.string().min(12),
  DEFAULT_TENANT_SLUG: z.string().min(1).default("jd-collection"),
  SUPER_ADMIN_USERNAME: z.string().min(3),
  SUPER_ADMIN_PASSWORD: z.string().min(12),
  NOTIFICATION_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  BILLING_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(900000),
  BILLING_PROVIDER: z.string().default("manual"),
  PLATFORM_DOMAIN: z.string().default("localhost"),
  PUBLIC_STORE_DOMAIN: z.string().default("localhost"),
  ALLOW_CUSTOM_DOMAINS: z.coerce.boolean().default(true),
  CUSTOM_DOMAIN_REQUIRE_VERIFICATION: z.coerce.boolean().default(true),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(65000),
  KEEP_ALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(65000),
  LOG_SLOW_REQUEST_MS: z.coerce.number().int().nonnegative().default(1000),
  MONGO_MAX_POOL_SIZE: z.coerce.number().int().positive().default(20),
  MONGO_MIN_POOL_SIZE: z.coerce.number().int().nonnegative().default(2),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  MONGO_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  MONGO_HEARTBEAT_FREQUENCY_MS: z.coerce.number().int().positive().default(10000),
  BACKUP_DIR: z.string().default("./backups")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration.");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
