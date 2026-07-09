// Upload rules, mirroring the .NET UploadRules: only the "image" type into the
// "dishes" folder, a closed set of image content types, and a 5 MB cap.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
};

export const ALLOWED_KEY_FOLDERS = ["dishes"] as const;
