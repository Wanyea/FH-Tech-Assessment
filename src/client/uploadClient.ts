export interface UploadSuccessResponse {
  frameCount: number;
}

export interface UploadErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

export function getMp3FileValidationError(file: Pick<File, "name"> | null): string | null {
  if (!file || !file.name.toLowerCase().endsWith(".mp3")) {
    return "Choose an .mp3 file.";
  }

  return null;
}

export async function uploadFile(file: File): Promise<number> {
  const formData = new FormData();

  formData.append("file", file);

  const response = await fetch("/file-upload", {
    method: "POST",
    body: formData,
  });

  return readFrameCountResponse(response);
}

export async function readFrameCountResponse(response: Response): Promise<number> {
  const payload = (await safeJson(response)) as UploadSuccessResponse | UploadErrorResponse | null;

  if (!response.ok) {
    const message =
      payload && "error" in payload && payload.error?.message
        ? payload.error.message
        : "The server rejected the upload.";
    throw new Error(message);
  }

  if (!payload || !("frameCount" in payload) || typeof payload.frameCount !== "number") {
    throw new Error("The server returned an unexpected response.");
  }

  return payload.frameCount;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
