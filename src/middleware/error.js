export function notFound(req, res) {
  res.status(404).json({ message: "Route not found" });
}

export function errorHandler(err, req, res, next) {
  if (err?.code === 11000) {
    return res.status(409).json({ message: "A record with that unique value already exists." });
  }
  if (err?.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }
  if (err?.name === "CastError") {
    return res.status(400).json({ message: "Invalid identifier." });
  }
  if (err?.name === "MulterError") {
    return res.status(400).json({ message: err.message });
  }
  if (err?.name === "ZodError") {
    return res.status(400).json({ message: "Invalid request data", errors: err.issues });
  }
  console.error("Unhandled server error:", JSON.stringify({
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl,
    status: err.status || 500,
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack
  }));
  res.status(err.status || 500).json({
    message: err.status ? err.message : "Internal server error",
    requestId: req.requestId || undefined
  });
}
