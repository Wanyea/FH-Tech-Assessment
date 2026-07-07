import multer from "multer";

import { Mp3FrameCounterError } from "../mp3/errors.js";

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
  };
}

export class HttpError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  public constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class BadRequestError extends HttpError {
  public constructor(message: string) {
    super(400, "BAD_REQUEST", message);
  }
}

export class UnsupportedMediaTypeError extends HttpError {
  public constructor(message: string) {
    super(415, "UNSUPPORTED_MEDIA_TYPE", message);
  }
}

export function toHttpError(error: unknown): HttpError {
  // App-raised HTTP errors already contain the public status/code/message.
  if (error instanceof HttpError) {
    return error;
  }

  // Multer errors come from multipart parsing before the route body runs.
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new HttpError(413, "FILE_TOO_LARGE", "The uploaded file is larger than the limit.");
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return new BadRequestError("Upload exactly one MP3 file using the 'file' field.");
    }

    return new BadRequestError(error.message);
  }

  // Parser errors mean the upload was readable but not valid audio data.
  if (error instanceof Mp3FrameCounterError) {
    if (error.code === "EMPTY_FILE") {
      return new BadRequestError(error.message);
    }

    return new HttpError(422, error.code, error.message);
  }

  // Unknown errors become a generic 500 response.
  return new HttpError(500, "INTERNAL_SERVER_ERROR", "An unexpected error occurred.");
}
