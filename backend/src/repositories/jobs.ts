import type Database from "better-sqlite3";

export type JobStatus =
  | "saved"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface CreateJobInput {
  company: string;
  title: string;
  jd_text?: string;
  status?: JobStatus;
}

export interface Job {
  id: number;
  company: string;
  title: string;
  jd_text: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
}

export function createJob(db: Database.Database, input: CreateJobInput): Job {
  const create = db.transaction(() => {
    const job = db
      .prepare(
        `
      INSERT INTO Jobs (company, title, jd_text, status)
      VALUES (?, ?, ?, ?)
      RETURNING id, company, title, jd_text, status,
                created_at, updated_at
    `,
      )
      .get(
        input.company,
        input.title,
        input.jd_text ?? "",
        input.status ?? "saved",
      ) as Job;

    db.prepare(
      `
      INSERT INTO Job_Events (job_id, status, occurred_at)
      VALUES (?, ?, ?)
    `,
    ).run(job.id, job.status, job.created_at);

    return job;
  });

  return create();
}

export function listJobs(db: Database.Database): Job[] {
  return db
    .prepare(
      `
    SELECT id, company, title, jd_text, status,
           created_at, updated_at
    FROM Jobs
    ORDER BY created_at DESC, id DESC
  `,
    )
    .all() as Job[];
}
