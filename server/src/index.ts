import "./load-env.js";
import { createApp } from "./app.js";
import { applyMigrations } from "./db/migrate.js";

if (process.env.RUN_MIGRATIONS === "true") {
  applyMigrations();
  console.log("Migrations applied successfully.");
}

const app = createApp();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
