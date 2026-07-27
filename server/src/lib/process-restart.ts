import { flushLogs } from "./logging/index.js";

export function requestProcessRestart(): void {
  setTimeout(() => {
    flushLogs(() => {
      process.exit(0);
    });
  }, 50);
}
