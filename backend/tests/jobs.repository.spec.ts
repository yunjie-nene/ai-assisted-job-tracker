import { test, expect } from "@playwright/test";
import type Database from "better-sqlite3";
import { openDatabase, initializeDatabase } from "../src/db/database.js";
import { createJob } from "../src/repositories/jobs.js";

let db: Database.Database;

test.beforeEach(() => {
  db = openDatabase(":memory:");
  initializeDatabase(db);
});

test.afterEach(() => {
  db?.close();
});

test("creating a job saves the job and its initial event", () => {
  const job = createJob(db, {
    company: "Example Company",
    title: "Software Engineer",
    status: "applied",
  });

  const savedJob = db
    .prepare(
      `
    SELECT * FROM Jobs WHERE id = ?
  `,
    )
    .get(job.id);

  expect(savedJob).toEqual(job);

  const events = db
    .prepare(
      `
    SELECT job_id, status, occurred_at
    FROM Job_Events
    WHERE job_id = ?
  `,
    )
    .all(job.id);

  expect(events).toEqual([
    {
      job_id: job.id,
      status: "applied",
      occurred_at: job.created_at,
    },
  ]);
});

test("creating a job rolls back if its initial event cannot be saved", () => {
  db.exec(`
    CREATE TEMP TRIGGER fail_event_insert
    BEFORE INSERT ON Job_Events
    BEGIN
      SELECT RAISE(ABORT, 'Simulated event write failure');
    END;
  `);

  expect(() => {
    createJob(db, {
      company: "Example Company",
      title: "Software Engineer",
      status: "applied",
    });
  }).toThrow("Simulated event write failure");

  expect(db.prepare("SELECT COUNT(*) AS count FROM Jobs").get()).toEqual({
    count: 0,
  });

  expect(db.prepare("SELECT COUNT(*) AS count FROM Job_Events").get()).toEqual({
    count: 0,
  });
});
