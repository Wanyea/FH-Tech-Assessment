import multer from "multer";
import { describe, expect, it } from "vitest";

import { Mp3FrameCounterError } from "../../src/mp3/errors.js";
import { BadRequestError, toHttpError } from "../../src/server/errors.js";

describe("toHttpError", () => {
  it("keeps app-raised HTTP errors unchanged", () => {
    const error = new BadRequestError("Upload exactly one MP3 file using the 'file' field.");

    expect(toHttpError(error)).toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: "Upload exactly one MP3 file using the 'file' field.",
    });
  });

  it("maps oversized uploads to a public 413 error", () => {
    const error = new multer.MulterError("LIMIT_FILE_SIZE");

    expect(toHttpError(error)).toMatchObject({
      statusCode: 413,
      code: "FILE_TOO_LARGE",
      message: "The uploaded file is larger than the limit.",
    });
  });

  it("maps unexpected file fields to a public 400 error", () => {
    const error = new multer.MulterError("LIMIT_UNEXPECTED_FILE");

    expect(toHttpError(error)).toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: "Upload exactly one MP3 file using the 'file' field.",
    });
  });

  it("maps empty parser input to a public 400 error", () => {
    const error = new Mp3FrameCounterError("EMPTY_FILE", "The uploaded file is empty.");

    expect(toHttpError(error)).toMatchObject({
      statusCode: 400,
      code: "BAD_REQUEST",
      message: "The uploaded file is empty.",
    });
  });

  it("maps invalid parser input to a public 422 error", () => {
    const error = new Mp3FrameCounterError(
      "UNSUPPORTED_MP3_FORMAT",
      "No MPEG Version 1 Layer III frames were found in the uploaded file.",
    );

    expect(toHttpError(error)).toMatchObject({
      statusCode: 422,
      code: "UNSUPPORTED_MP3_FORMAT",
      message: "No MPEG Version 1 Layer III frames were found in the uploaded file.",
    });
  });

  it("maps unknown exceptions to a generic 500 error", () => {
    const error = new Error("database exploded");

    expect(toHttpError(error)).toMatchObject({
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    });
  });
});
