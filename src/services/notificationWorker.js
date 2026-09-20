import Notification from "../models/Notification.js";
import { deliverNotification } from "./notificationService.js";

let timer = null;
let running = false;

const STALE_LOCK_MS = 10 * 60 * 1000;

export async function processScheduledNotifications() {
  if (running) return;
  running = true;

  try {
    const now = new Date();

    // Recover notifications claimed by a process that died during delivery.
    await Notification.updateMany(
      {
        status: "sending",
        processingStartedAt: { $lt: new Date(Date.now() - STALE_LOCK_MS) },
        attempts: { $lt: 3 }
      },
      {
        $set: { status: "scheduled", nextAttemptAt: now, processingStartedAt: null }
      }
    );

    // Atomically claim one due notification. This is safe when multiple
    // application instances are running because findOneAndUpdate is atomic.
    for (let i = 0; i < 10; i++) {
    const claimed = await Notification.findOneAndUpdate(
      {
        status: "scheduled",
        scheduledFor: { $lte: now },
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
        attempts: { $lt: 3 }
      },
      {
        $set: {
          status: "sending",
          processingStartedAt: now
        },
        $inc: { attempts: 1 }
      },
      { sort: { scheduledFor: 1 }, new: true }
    );

    if (!claimed) break;
    const notification = await Notification.findById(claimed._id);
    if (notification) { try { await deliverNotification(notification); } catch {} }
    }
  } catch (error) {
    console.error("Notification worker error:", error.message);
  } finally {
    running = false;
  }
}

export function startNotificationWorker(intervalMs = 30000) {
  if (timer) return;
  timer = setInterval(processScheduledNotifications, Math.max(5000, intervalMs));
  timer.unref?.();
  void processScheduledNotifications();
  console.log(`Notification worker started (${Math.max(5000, intervalMs)}ms interval).`);
}

export function stopNotificationWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
