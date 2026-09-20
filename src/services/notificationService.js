import webpush from "../config/push.js";
import PushSubscription from "../models/PushSubscription.js";
import NotificationDelivery from "../models/NotificationDelivery.js";

export async function sendToAll(payload, tenantId, notificationId = null) {
  const subscriptions = await PushSubscription.find({ tenantId }).lean();
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(subscription, JSON.stringify(payload))
    )
  );

  let successCount = 0;
  let failureCount = 0;
  const invalidEndpoints = [];
  const now = new Date();

  const deliveryOps = [];

  results.forEach((result, index) => {
    const subscription = subscriptions[index];
    if (result.status === "fulfilled") {
      successCount++;
      if (notificationId) {
        deliveryOps.push({
          updateOne: {
            filter: { tenantId, notificationId, endpoint: subscription.endpoint },
            update: {
              $set: {
                status: "success",
                errorCode: null,
                errorMessage: "",
                sentAt: now
              }
            },
            upsert: true
          }
        });
      }
      return;
    }

    failureCount++;
    const error = result.reason;
    const code = Number(error?.statusCode) || null;
    const message = String(error?.message || "Push delivery failed").slice(0, 500);

    if (code === 404 || code === 410) invalidEndpoints.push(subscription.endpoint);

    if (notificationId) {
      deliveryOps.push({
        updateOne: {
          filter: { tenantId, notificationId, endpoint: subscription.endpoint },
          update: {
            $set: {
              status: "failed",
              errorCode: code,
              errorMessage: message,
              sentAt: null
            }
          },
          upsert: true
        }
      });
    }
  });

  if (deliveryOps.length) await NotificationDelivery.bulkWrite(deliveryOps, { ordered: false });
  if (invalidEndpoints.length) {
    await PushSubscription.deleteMany({
      tenantId,
      endpoint: { $in: invalidEndpoints }
    });
  }

  return {
    recipientCount: subscriptions.length,
    successCount,
    failureCount
  };
}


export async function deliverNotification(notification) {
  notification.status = "sending";
  notification.processingStartedAt = new Date();
  notification.lastError = "";
  await notification.save();

  try {
    const result = await sendToAll(
      {
        title: notification.title,
        body: notification.message,
        image: notification.image || undefined,
        data: { url: notification.url || "/" }
      },
      notification.tenantId,
      notification._id
    );

    Object.assign(notification, result, {
      status: result.failureCount ? "partial" : "sent",
      sentAt: new Date(),
      processingStartedAt: null,
      nextAttemptAt: null
    });
    await notification.save();
    return notification;
  } catch (error) {
    notification.processingStartedAt = null;
    notification.lastError = String(error?.message || "Notification delivery failed").slice(0, 500);

    if (notification.attempts < notification.maxAttempts) {
      notification.status = "scheduled";
      notification.nextAttemptAt = new Date(
        Date.now() + Math.min(15 * 60 * 1000, 30 * 1000 * 2 ** notification.attempts)
      );
    } else {
      notification.status = "failed";
      notification.nextAttemptAt = null;
    }
    await notification.save();
    throw error;
  }
}
