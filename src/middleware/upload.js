import multer from "multer";

const allowed = new Set([
  "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/webm", "video/quicktime"
]);

const storage = multer.memoryStorage();

export const mediaUpload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 12, fields: 80, parts: 100 },
  fileFilter: (req, file, cb) => {
    if (!allowed.has(file.mimetype)) return cb(new Error("Unsupported media type"));
    cb(null, true);
  }
});
