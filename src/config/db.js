import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("autoIndex", env.NODE_ENV !== "production");

mongoose.connection.on("connected", () => console.log("MongoDB connection established."));
mongoose.connection.on("disconnected", () => console.warn("MongoDB disconnected."));
mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected."));
mongoose.connection.on("error", (error) => console.error("MongoDB connection error:", error.message));

export async function connectDB() {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: env.MONGO_SOCKET_TIMEOUT_MS,
    heartbeatFrequencyMS: env.MONGO_HEARTBEAT_FREQUENCY_MS,
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    minPoolSize: env.MONGO_MIN_POOL_SIZE,
    maxIdleTimeMS: 60000
  });
  console.log(`MongoDB connected (pool ${env.MONGO_MIN_POOL_SIZE}-${env.MONGO_MAX_POOL_SIZE}).`);
}

export function getDatabaseHealth() {
  const states = ["disconnected", "connected", "connecting", "disconnecting", "uninitialized"];
  return {
    state: states[mongoose.connection.readyState] || "unknown",
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null
  };
}

export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
