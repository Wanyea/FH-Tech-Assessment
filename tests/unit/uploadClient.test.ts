import { describe, expect, it } from "vitest";

import {
  getMp3FileValidationError,
  readFrameCountResponse,
} from "../../src/client/uploadClient.js";

describe("getMp3FileValidationError", () => {
  it("requires a selected file", () => {
    expect(getMp3FileValidationError(null)).toBe("Choose an .mp3 file.");
  });

  it("rejects non-MP3 file names", () => {
    expect(getMp3FileValidationError({ name: "notes.txt" })).toBe("Choose an .mp3 file.");
  });

  it("accepts MP3 file names case-insensitively", () => {
    expect(getMp3FileValidationError({ name: "SONG.MP3" })).toBeNull();
  });
});

describe("readFrameCountResponse", () => {
  it("returns the frame count from a successful upload response", async () => {
    const response = jsonResponse(200, {
      frameCount: 6089,
    });

    await expect(readFrameCountResponse(response)).resolves.toBe(6089);
  });

  it("uses the server-provided error message when the upload is rejected", async () => {
    const response = jsonResponse(415, {
      error: {
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Upload an MP3 file.",
      },
    });

    await expect(readFrameCountResponse(response)).rejects.toThrow("Upload an MP3 file.");
  });

  it("uses a fallback message when an error response is not JSON", async () => {
    const response = new Response("plain text error", {
      status: 500,
    });

    await expect(readFrameCountResponse(response)).rejects.toThrow(
      "The server rejected the upload.",
    );
  });

  it("rejects a success response with an unexpected payload shape", async () => {
    const response = jsonResponse(200, {
      frameCount: "6089",
    });

    await expect(readFrameCountResponse(response)).rejects.toThrow(
      "The server returned an unexpected response.",
    );
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}
