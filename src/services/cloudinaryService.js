import cloudinary from "../config/cloudinary.js";

export async function uploadBuffer(buffer, { folder, resourceType }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, use_filename: false, unique_filename: true },
      (error, result) => error ? reject(error) : resolve(result)
    );
    stream.end(buffer);
  });
}

export async function destroyAsset(publicId, resourceType) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}
