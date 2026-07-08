import {
  AlertTriangle,
  CheckCircle2,
  FileAudio,
  Loader2,
  Music2,
  RotateCcw,
  Upload,
} from "lucide-react";
import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from "react";

import { getMp3FileValidationError, uploadFile } from "./uploadClient";

interface AnalysisHistoryItem {
  id: string;
  fileName: string;
  frameCount: number;
  analyzedAt: string;
}

type AnalysisStatus = "idle" | "ready" | "uploading" | "success" | "error";

// Recent results live only in React state, so keep the list short.
const MAX_LOCAL_HISTORY = 4;

export function App(): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [frameCount, setFrameCount] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);

  // Derive display copy from status so buttons, messages, and pills stay in sync.
  const statusText = useMemo(() => {
    switch (status) {
      case "ready":
        return "Ready";
      case "uploading":
        return "Analyzing";
      case "success":
        return "Complete";
      case "error":
        return "Needs attention";
      default:
        return "Waiting";
    }
  }, [status]);

  const canAnalyze = selectedFile !== null && status !== "uploading";

  function openFilePicker(): void {
    fileInputRef.current?.click();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    setFile(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    // Prevent the browser from opening the dropped file as a new page.
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files[0] ?? null;
    setFile(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    // Required for the drop event to fire on this element.
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(): void {
    setIsDragActive(false);
  }

  function setFile(file: File | null): void {
    // A new file selection clears any previous result or error.
    setFrameCount(null);
    setErrorMessage(null);

    if (!file) {
      setSelectedFile(null);
      setStatus("idle");
      return;
    }

    const validationError = getMp3FileValidationError(file);

    if (validationError) {
      setSelectedFile(null);
      setStatus("error");
      setErrorMessage(validationError);
      return;
    }

    setSelectedFile(file);
    setStatus("ready");
  }

  async function analyzeSelectedFile(): Promise<void> {
    if (!selectedFile) {
      setStatus("error");
      setErrorMessage("Choose an .mp3 file.");
      return;
    }

    const validationError = getMp3FileValidationError(selectedFile);

    if (validationError) {
      setStatus("error");
      setErrorMessage(validationError);
      return;
    }

    setStatus("uploading");
    setErrorMessage(null);
    setFrameCount(null);

    try {
      const analyzedFrameCount = await uploadFile(selectedFile);
      setFrameCount(analyzedFrameCount);
      setStatus("success");
      setHistory((currentHistory) =>
        // Newest analyses are shown first.
        [
          {
            id: crypto.randomUUID(),
            fileName: selectedFile.name,
            frameCount: analyzedFrameCount,
            analyzedAt: new Date().toLocaleTimeString(),
          },
          ...currentHistory,
        ].slice(0, MAX_LOCAL_HISTORY),
      );
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "The upload failed.");
    }
  }

  function reset(): void {
    setSelectedFile(null);
    setFrameCount(null);
    setErrorMessage(null);
    setStatus("idle");

    if (fileInputRef.current) {
      // File inputs cannot be fully controlled through React state.
      fileInputRef.current.value = "";
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="app-title">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">MPEG 1 Layer III</p>
            <h1 id="app-title">MP3 Frame Analyzer</h1>
          </div>
          <div className={`status-pill status-${status}`}>
            {status === "uploading" ? <Loader2 className="spin" size={16} /> : <Music2 size={16} />}
            <span>{statusText}</span>
          </div>
        </header>

        <div className="tool-grid">
          <div className="analysis-panel">
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={handleFileChange}
            />

            <div
              className={`drop-zone${isDragActive ? " is-active" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              role="button"
              tabIndex={0}
              onClick={openFilePicker}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openFilePicker();
                }
              }}
            >
              <div className="drop-icon">
                <FileAudio size={32} />
              </div>
              <div className="file-meta">
                <span className="file-name">{selectedFile?.name ?? "No file selected"}</span>
                <span className="file-size">
                  {selectedFile ? formatBytes(selectedFile.size) : "MP3 upload"}
                </span>
              </div>
            </div>

            <div className="action-row">
              <button className="secondary-button" type="button" onClick={openFilePicker}>
                <Upload size={18} />
                <span>Choose MP3</span>
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  void analyzeSelectedFile();
                }}
                disabled={!canAnalyze}
              >
                {status === "uploading" ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                <span>Analyze</span>
              </button>
              <button className="icon-button" type="button" onClick={reset} title="Reset">
                <RotateCcw size={18} />
              </button>
            </div>

            {status === "error" && errorMessage ? (
              <div className="message message-error" role="alert">
                <AlertTriangle size={18} />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            {status === "success" && frameCount !== null ? (
              <div className="result-panel" aria-live="polite">
                <span className="result-label">Frame count</span>
                <strong>{frameCount.toLocaleString()}</strong>
              </div>
            ) : null}
          </div>

          <aside className="history-panel" aria-label="Recent analyses">
            <div className="panel-heading">
              <span>Recent</span>
              <span>{history.length}</span>
            </div>
            {history.length === 0 ? (
              <p className="empty-state">No completed analyses.</p>
            ) : (
              <ul>
                {history.map((item) => (
                  <li key={item.id}>
                    <span className="history-name">{item.fileName}</span>
                    <span className="history-count">{item.frameCount.toLocaleString()} frames</span>
                    <time>{item.analyzedAt}</time>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}
