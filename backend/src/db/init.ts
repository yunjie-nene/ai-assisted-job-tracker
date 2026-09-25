import "dotenv/config";
import { resolve } from "node:path";
import { openDatabase, initializeDatabase } from "./database.js";

const configuredPath = process.env.DATABASE_PATH ?? "./data/job-tracker.db";

if (!configuredPath.trim()) {
  throw new Error("DATABASE_PATH must not be empty.");
}

const databasePath = resolve(configuredPath);
const db = openDatabase(databasePath);

try {
  initializeDatabase(db);

  const tables = db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `,
    )
    .all();

  console.log("Database initialized:", databasePath);
  console.table(tables);
} finally {
  db.close();
}
