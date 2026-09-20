import "dotenv/config";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { env } from "../src/config/env.js";

const execFileAsync = promisify(execFile);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.resolve(env.BACKUP_DIR, `mongodb-${stamp}`);
await fs.mkdir(backupDir, { recursive: true });

try {
  const { stdout, stderr } = await execFileAsync(
    process.env.MONGODUMP_BIN || "mongodump",
    ["--uri", env.MONGODB_URI, "--out", backupDir],
    { maxBuffer: 4 * 1024 * 1024 }
  );
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  console.log(`MongoDB backup created at ${backupDir}`);
} catch (error) {
  console.error("MongoDB backup failed. Ensure mongodump is installed and BACKUP_DIR is writable.");
  console.error(error.message);
  process.exit(1);
}
