import "dotenv/config";
import { createApp } from "./app.js";
import { openDatabase, initializeDatabase } from "./db/database.js";

const port = Number(process.env.PORT ?? 3000);
const databasePath = process.env.DATABASE_PATH ?? "./data/job-tracker.db";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

if (!databasePath.trim()) {
  throw new Error("DATABASE_PATH must not be empty.");
}

const db = openDatabase(databasePath);

try {
  initializeDatabase(db);
} catch (error) {
  db.close();
  throw error;
}

const app = createApp(db);

const server = app.listen(port, "localhost", () => {
  console.log(`API running at http://localhost:${port}`);
});

server.on("error", (error) => {
  console.error("Failed to start server:", error.message);
  db.close();
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => {
    db.close();
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
