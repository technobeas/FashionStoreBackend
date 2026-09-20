import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath, pathToFileURL } from "url";
import { env } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.resolve(__dirname, "../src/models");

await mongoose.connect(env.MONGODB_URI, {
  serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
  maxPoolSize: 3
});

const files = (await fs.readdir(modelsDir)).filter(f => f.endsWith(".js"));
for (const file of files) await import(pathToFileURL(path.join(modelsDir, file)).href);

const report = [];
for (const model of Object.values(mongoose.models)) {
  if (!model.collection?.collectionName) continue;
  const expected = model.schema.indexes().map(([fields, options]) => ({
    fields,
    unique: Boolean(options?.unique),
    sparse: Boolean(options?.sparse)
  }));
  let actual = [];
  try {
    actual = (await model.collection.listIndexes().toArray()).map(i => ({
      name: i.name,
      fields: i.key,
      unique: Boolean(i.unique),
      sparse: Boolean(i.sparse)
    }));
  } catch (error) {
    report.push({ model: model.modelName, error: error.message });
    continue;
  }
  const actualSignatures = new Set(actual.map(i => JSON.stringify({ fields: i.fields, unique: i.unique, sparse: i.sparse })));
  const missing = expected.filter(i => !actualSignatures.has(JSON.stringify(i)));
  report.push({ model: model.modelName, collection: model.collection.collectionName, expected: expected.length, actual: actual.length, missing });
}

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2));
await mongoose.disconnect();
