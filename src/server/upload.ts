import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import multer from "multer";

import { UnsupportedMediaTypeError } from "./errors.js";

// 25 MiB default limit, overridable with MAX_UPLOAD_BYTES.
// TODO: Will reeevalute optimizations and remove this limit later.

const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Disk storage keeps uploaded bytes out of the Node process heap.
const UPLOAD_DIR = path.join(tmpdir(), "mp3-frame-analysis-app-uploads");

// MIME values for MP3 files vary by browser and operating system.
const MP3_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/mpeg3",
  "audio/x-mpeg-3",
  "application/octet-stream",
]);

mkdirSync(UPLOAD_DIR, { recursive: true });

export const maxUploadBytes = readMaxUploadBytes();

export const uploadMiddleware = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: maxUploadBytes,
    // Only one file should be accepted per request.
    files: 1,
  },
  fileFilter(_request, file, callback) {
    const hasMp3Extension = file.originalname.toLowerCase().endsWith(".mp3");
    const hasMp3MimeType = MP3_MIME_TYPES.has(file.mimetype.toLowerCase());

    if (!hasMp3Extension && !hasMp3MimeType) {
      callback(new UnsupportedMediaTypeError("Upload an MP3 file."));
      return;
    }

    callback(null, true);
  },
});

function readMaxUploadBytes(): number {
  const rawValue = process.env.MAX_UPLOAD_BYTES;

  if (!rawValue) {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }

  return parsedValue;
}
