export const MEDIA_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".mp4",
  ".mov",
  ".heic",
]);

export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic"]);
export const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);

export const MEDIA_DIRS = ["media/posts", "media/stories", "media/other"];

export const DEFAULT_ROOT_FOLDER_NAME = "Instagram Export";
export const DEFAULT_STATE_FILENAME = ".migration-state.json";

export const RESUMABLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB

export const DEFAULT_BATCH_SIZE = 10;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
