import zlib from "zlib";

const THRESHOLD = 1024;

export function responseCompression(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.headersSent) return originalJson(body);
    const accept = String(req.get("Accept-Encoding") || "").toLowerCase();
    if (!accept.includes("gzip") || res.get("Content-Encoding")) return originalJson(body);

    let payload;
    try {
      payload = Buffer.from(JSON.stringify(body));
    } catch {
      return originalJson(body);
    }
    if (payload.length < THRESHOLD) return originalJson(body);

    const compressed = zlib.gzipSync(payload, { level: zlib.constants.Z_BEST_SPEED });
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Content-Length", compressed.length);
    return res.end(compressed);
  };
  next();
}
