export type Mp3FrameCounterErrorCode =
  | "EMPTY_FILE"
  | "TRUNCATED_ID3_TAG"
  | "INVALID_ID3_TAG"
  | "UNSUPPORTED_MP3_FORMAT"
  | "TRUNCATED_MP3_FRAME";

export class Mp3FrameCounterError extends Error {
  public readonly code: Mp3FrameCounterErrorCode;

  public constructor(code: Mp3FrameCounterErrorCode, message: string) {
    super(message);
    this.name = "Mp3FrameCounterError";
    this.code = code;
  }
}
