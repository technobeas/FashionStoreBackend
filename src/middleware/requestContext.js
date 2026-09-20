import crypto from "crypto";

export function requestContext(req, res, next) {
  const supplied = String(req.get("X-Request-ID") || "").trim();
  const requestId = /^[A-Za-z0-9._:-]{1,100}$/.test(supplied) ? supplied : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  const started = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    req.requestDurationMs = Math.round(durationMs * 100) / 100;
  });
  next();
}
