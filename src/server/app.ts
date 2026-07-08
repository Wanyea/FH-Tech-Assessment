import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

import { countMp3FramesFromFile } from "../mp3/mp3FrameCounter.js";
import { BadRequestError, toHttpError, type ErrorResponseBody } from "./errors.js";
import { maxUploadBytes, uploadMiddleware } from "./upload.js";

type AsyncRequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void>;

// Build the app separately from server.listen so tests can import the route
// stack without opening a network port.
export function createApp(): express.Express {
  const app = express();

  // Remove Express's default header so responses do not expose the framework.
  app.disable("x-powered-by");

  app.get("/health", (_request, response) => {
    response.status(200).json({
      ok: true,
      maxUploadBytes,
    });
  });

  // Multer parses multipart data and stores the uploaded file on disk.
  // The route returns only the public frame-count JSON response.
  app.post(
    "/file-upload",
    uploadMiddleware.single("file"),
    asyncHandler(async (request, response) => {
      const uploadedFile = request.file;

      if (!uploadedFile) {
        throw new BadRequestError("Upload exactly one MP3 file using the 'file' field.");
      }

      try {
        const result = await countMp3FramesFromFile(uploadedFile.path);

        response.status(200).json({
          frameCount: result.frameCount,
        });
      } finally {
        // The parser only needs the temporary file during this request.
        await removeUploadedFile(uploadedFile.path);
      }
    }),
  );

  serveClientApp(app);

  app.use((_request, _response, next) => {
    next(new BadRequestError("Endpoint not found."));
  });

  app.use(errorHandler);

  return app;
}

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  const httpError = toHttpError(error);
  const body: ErrorResponseBody = {
    error: {
      code: httpError.code,
      message: httpError.message,
    },
  };

  response.status(httpError.statusCode).json(body);
};

function asyncHandler(handler: AsyncRequestHandler): RequestHandler {
  // Express 4 route handlers do not catch rejected promises automatically.
  return (request, response, next) => {
    handler(request, response, next).catch(next);
  };
}

async function removeUploadedFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function serveClientApp(app: express.Express): void {
  const clientDistPath = path.resolve(process.cwd(), "dist/client");
  const clientIndexPath = path.join(clientDistPath, "index.html");

  if (!existsSync(clientIndexPath)) {
    return;
  }

  // When dist/client exists, Express serves the built frontend assets too.
  app.use(express.static(clientDistPath));

  app.get("*", (_request, response) => {
    response.sendFile(clientIndexPath);
  });
}
