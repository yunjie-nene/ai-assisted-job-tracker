import { test, expect } from "@playwright/test";
import type Database from "better-sqlite3";
import { openDatabase, initializeDatabase } from "../src/db/database.js";

let db: Database.Database;

test.beforeEach(() => {
  db = openDatabase(":memory:");
  initializeDatabase(db);
});

test.afterEach(() => {
  db?.close();
});

test("initialization creates all tables and preserves existing data", () => {
  db.prepare(
    `
    INSERT INTO Jobs (company, title)
    VALUES (?, ?)
  `,
  ).run("Example Company", "Software Engineer");

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

  expect(tables).toEqual([
    { name: "Interviews" },
    { name: "Job_Events" },
    { name: "Jobs" },
  ]);

  const jobs = db
    .prepare(
      `
    SELECT company, title, status FROM Jobs
  `,
    )
    .all();

  expect(jobs).toEqual([
    {
      company: "Example Company",
      title: "Software Engineer",
      status: "saved",
    },
  ]);
});

test("events and interviews must reference an existing job", () => {
  expect(() => {
    db.prepare(
      `
      INSERT INTO Job_Events (job_id, status)
      VALUES (?, ?)
    `,
    ).run(999, "applied");
  }).toThrow(/FOREIGN KEY constraint failed/);

  expect(() => {
    db.prepare(
      `
      INSERT INTO Interviews (job_id, title)
      VALUES (?, ?)
    `,
    ).run(999, "Technical Interview");
  }).toThrow(/FOREIGN KEY constraint failed/);
});

test("jobs reject an invalid application status", () => {
  expect(() => {
    db.prepare(
      `
      INSERT INTO Jobs (company, title, status)
      VALUES (?, ?, ?)
    `,
    ).run("Example Company", "Software Engineer", "unknown");
  }).toThrow(/CHECK constraint failed/);
});
