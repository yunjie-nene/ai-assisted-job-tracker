import { test, expect } from "@playwright/test";
import type Database from "better-sqlite3";
import { openDatabase, initializeDatabase } from "../src/db/database.js";
import { createJob, updateJobStatus } from "../src/repositories/jobs.js";

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

test("status updates save history without duplicating unchanged status", () => {
  const job = createJob(db, {
    company: "Example Company",
    title: "Software Engineer",
    status: "applied",
  });

  const result = updateJobStatus(db, job.id, {
    status: "interview",
    notes: "Received an interview invitation",
  });

  expect(result.kind).toBe("updated");

  if (result.kind !== "updated") {
    throw new Error("Expected an updated job.");
  }

  const storedJob = db.prepare("SELECT * FROM Jobs WHERE id = ?").get(job.id);

  expect(storedJob).toEqual(result.job);
  expect(result.job).toMatchObject({
    id: job.id,
    status: "interview",
    created_at: job.created_at,
  });

  const events = db
    .prepare(
      `
    SELECT status, notes, occurred_at
    FROM Job_Events
    WHERE job_id = ?
    ORDER BY id
  `,
    )
    .all(job.id);

  expect(events).toEqual([
    {
      status: "applied",
      notes: "",
      occurred_at: job.created_at,
    },
    {
      status: "interview",
      notes: "Received an interview invitation",
      occurred_at: result.job.updated_at,
    },
  ]);

  expect(updateJobStatus(db, job.id, { status: "interview" })).toEqual({
    kind: "unchanged",
  });

  expect(
    db
      .prepare("SELECT COUNT(*) AS count FROM Job_Events WHERE job_id = ?")
      .get(job.id),
  ).toEqual({ count: 2 });
});

test("status updates roll back when history cannot be saved", () => {
  const job = createJob(db, {
    company: "Example Company",
    title: "Software Engineer",
    status: "applied",
  });

  const originalEvents = db
    .prepare("SELECT * FROM Job_Events WHERE job_id = ? ORDER BY id")
    .all(job.id);

  db.exec(`
    CREATE TEMP TRIGGER fail_status_event_insert
    BEFORE INSERT ON Job_Events
    BEGIN
      SELECT RAISE(ABORT, 'Simulated event write failure');
    END;
  `);

  expect(() => {
    updateJobStatus(db, job.id, {
      status: "interview",
      notes: "Received an interview invitation",
    });
  }).toThrow("Simulated event write failure");

  expect(db.prepare("SELECT * FROM Jobs WHERE id = ?").get(job.id)).toEqual(
    job,
  );

  expect(
    db
      .prepare("SELECT * FROM Job_Events WHERE job_id = ? ORDER BY id")
      .all(job.id),
  ).toEqual(originalEvents);
});
