import { v2 as cloudinary } from "cloudinary";

export function configureCloudinary(): void {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables."
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export async function createFolder(
  folderPath: string
): Promise<{ path: string; name: string }> {
  configureCloudinary();
  const result = await cloudinary.api.create_folder(folderPath);
  return { path: result.path, name: result.name };
}

export async function uploadAsset(
  filePath: string,
  folder: string
): Promise<{ publicId: string; secureUrl: string }> {
  configureCloudinary();

  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: "auto",
    use_filename: true,
    unique_filename: false,
    overwrite: false,
  });

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
  };
}

export async function listAssetsInFolder(
  folder: string
): Promise<{ publicId: string; filename: string }[]> {
  configureCloudinary();
  const assets: { publicId: string; filename: string }[] = [];
  let nextCursor: string | undefined;

  do {
    const result = await cloudinary.api.resources({
      type: "upload",
      prefix: folder,
      max_results: 500,
      next_cursor: nextCursor,
    });

    for (const resource of result.resources) {
      assets.push({
        publicId: resource.public_id,
        filename: resource.public_id.split("/").pop() || resource.public_id,
      });
    }

    nextCursor = result.next_cursor;
  } while (nextCursor);

  return assets;
}
