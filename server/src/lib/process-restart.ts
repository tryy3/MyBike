import { flushLogs } from "./logging/index.js";

export function requestProcessRestart(): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  setTimeout(() => {
    flushLogs(() => {
      process.exit(0);
    });
  }, 50);
}
