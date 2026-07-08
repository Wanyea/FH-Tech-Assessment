import path from "node:path";
import request from "supertest";
import { describe, expect, it, type ExpectStatic } from "vitest";

import { createApp } from "../../src/server/app.js";

describe("POST /file-upload", () => {
  const samplePath = path.resolve("tests/fixtures/sample.mp3");

  it("returns the frame count for the provided sample MP3", async () => {
    const app = createApp();
    const response = await request(app).post("/file-upload").attach("file", samplePath);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).toEqual({
      frameCount: 6089,
    });
  });

  it("requires the file field", async () => {
    const app = createApp();
    const response = await request(app).post("/file-upload").field("unused", "value");

    expectErrorResponse(expect, response, 400, "BAD_REQUEST");
  });

  it("rejects uploads sent with the wrong field name", async () => {
    const app = createApp();
    const response = await request(app).post("/file-upload").attach("audio", samplePath);

    expectErrorResponse(expect, response, 400, "BAD_REQUEST");
  });

  it("rejects requests that contain more than one file", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/file-upload")
      .attach("file", samplePath)
      .attach("file", samplePath);

    expectErrorResponse(expect, response, 400, "BAD_REQUEST");
  });

  it("rejects non-MP3 uploads before parsing", async () => {
    const app = createApp();
    const response = await request(app).post("/file-upload").attach("file", Buffer.from("hello"), {
      filename: "note.txt",
      contentType: "text/plain",
    });

    expectErrorResponse(expect, response, 415, "UNSUPPORTED_MEDIA_TYPE");
  });

  it("reports empty MP3 uploads without crashing the server", async () => {
    const app = createApp();
    const response = await request(app).post("/file-upload").attach("file", Buffer.from([]), {
      filename: "empty.mp3",
      contentType: "audio/mpeg",
    });

    expectErrorResponse(expect, response, 400, "BAD_REQUEST");
  });

  it("reports invalid MP3 payloads as parser errors", async () => {
    const app = createApp();
    const response = await request(app)
      .post("/file-upload")
      .attach("file", Buffer.from("not really an mp3"), {
        filename: "fake.mp3",
        contentType: "audio/mpeg",
      });

    expectErrorResponse(expect, response, 422, "UNSUPPORTED_MP3_FORMAT");
  });

  it("continues accepting valid uploads after a failed upload", async () => {
    const app = createApp();
    const invalidResponse = await request(app)
      .post("/file-upload")
      .attach("file", Buffer.from("not really an mp3"), {
        filename: "fake.mp3",
        contentType: "audio/mpeg",
      });

    expectErrorResponse(expect, invalidResponse, 422, "UNSUPPORTED_MP3_FORMAT");

    const healthResponse = await request(app).get("/health");
    expect(healthResponse.status).toBe(200);

    const validResponse = await request(app).post("/file-upload").attach("file", samplePath);
    expect(validResponse.status).toBe(200);
    expect(validResponse.body).toEqual({
      frameCount: 6089,
    });
  });
});

function expectErrorResponse(
  expect: ExpectStatic,
  response: request.Response,
  statusCode: number,
  errorCode: string,
): void {
  expect(response.status).toBe(statusCode);
  expect(response.headers["content-type"]).toContain("application/json");
  expect(response.body).toEqual({
    error: {
      code: errorCode,
      message: expect.any(String) as string,
    },
  });
}
