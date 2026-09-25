import { test, expect } from "@playwright/test";
import type Database from "better-sqlite3";
import { openDatabase, initializeDatabase } from "../src/db/database.js";
import { createJob, deleteJob, updateJobStatus } from "../src/repositories/jobs.js";
import { createInterview, deleteInterview } from "../src/repositories/interviews.js";

let db: Database.Database;

test.beforeEach(() => {
  db = openDatabase(":memory:");
  initializeDatabase(db);
});

test.afterEach(() => {
  db?.close();
});

function snapshot() {
  return {
    jobs: db.prepare("SELECT * FROM Jobs ORDER BY id").all(),
    events: db.prepare("SELECT * FROM Job_Events ORDER BY id").all(),
    interviews: db.prepare("SELECT * FROM Interviews ORDER BY id").all(),
  };
}

test("deleting a job removes its children and preserves other jobs", () => {
  const kept = createJob(db, { company: "Kept Company", title: "Engineer" });
  createInterview(db, kept.id, { title: "Kept interview" });
  const expected = snapshot();

  const removed = createJob(db, { company: "Removed Company", title: "Engineer" });
  updateJobStatus(db, removed.id, { status: "interview" });
  createInterview(db, removed.id, { title: "First round" });
  createInterview(db, removed.id, { title: "Second round" });

  expect(deleteJob(db, removed.id)).toBe(true);
  expect(snapshot()).toEqual(expected);
  expect(deleteJob(db, removed.id)).toBe(false);
  expect(snapshot()).toEqual(expected);
});

test("failed job deletion restores the job, interviews and status history", () => {
  const job = createJob(db, { company: "Example Company", title: "Engineer" });
  updateJobStatus(db, job.id, { status: "interview" });
  createInterview(db, job.id, { title: "First round" });
  createInterview(db, job.id, { title: "Second round" });
  const before = snapshot();

  db.exec(`
    CREATE TEMP TRIGGER fail_job_delete
    BEFORE DELETE ON Jobs
    BEGIN
      SELECT RAISE(ABORT, 'Simulated job deletion failure');
    END;
  `);

  expect(() => deleteJob(db, job.id)).toThrow("Simulated job deletion failure");
  expect(snapshot()).toEqual(before);
});

test("deleting missing records does not change existing data", () => {
  const job = createJob(db, { company: "Example Company", title: "Engineer" });
  createInterview(db, job.id, { title: "First round" });
  const before = snapshot();

  expect(deleteJob(db, Number.MAX_SAFE_INTEGER)).toBe(false);
  expect(deleteInterview(db, Number.MAX_SAFE_INTEGER)).toBe(false);
  expect(snapshot()).toEqual(before);
});
