import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { schema } from "./schema.js";

export function openDatabase(filename: string): Database.Database {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const db = new Database(filename);

  try {
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");

    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function initializeDatabase(db: Database.Database): void {
  const initialize = db.transaction(() => {
    db.exec(schema);
  });

  initialize();
}
