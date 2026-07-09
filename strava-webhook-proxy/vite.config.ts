import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    setupFiles: ["./src/test/setup.ts"],
    pool: "forks",
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
  },
});
