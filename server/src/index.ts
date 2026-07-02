import { createApp } from "./app";
import { applyMigrations } from "./db/migrate";

if (process.env.RUN_MIGRATIONS === "true") {
  applyMigrations();
  console.log("Migrations applied successfully.");
}

const app = createApp();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
