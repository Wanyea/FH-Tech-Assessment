import { createServer } from "node:http";

import { createApp } from "./app.js";

const DEFAULT_PORT = 3000;
const port = readPort();
const server = createServer(createApp());

server.listen(port, () => {
  console.log(`MP3 Frame Analysis API listening on http://127.0.0.1:${port}`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function readPort(): number {
  const rawValue = process.env.PORT;

  if (!rawValue) {
    return DEFAULT_PORT;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_PORT;
  }

  return parsedValue;
}

function shutdown(): void {
  server.close(() => {
    process.exit(0);
  });
}
