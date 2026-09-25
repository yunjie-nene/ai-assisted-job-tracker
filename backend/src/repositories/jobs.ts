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

export interface UpdateJobStatusInput {
  status: JobStatus;
  notes?: string;
}

export type UpdateJobStatusResult =
  | { kind: "updated"; job: Job }
  | { kind: "not_found" }
  | { kind: "unchanged" };

export function updateJobStatus(
  db: Database.Database,
  jobId: number,
  input: UpdateJobStatusInput,
): UpdateJobStatusResult {
  const update = db.transaction((): UpdateJobStatusResult => {
    const existingJob = db
      .prepare(
        `
      SELECT id, company, title, jd_text, status,
             created_at, updated_at
      FROM Jobs
      WHERE id = ?
    `,
      )
      .get(jobId) as Job | undefined;

    if (!existingJob) {
      return { kind: "not_found" };
    }

    if (existingJob.status === input.status) {
      return { kind: "unchanged" };
    }

    const now = new Date().toISOString();

    const updatedJob = db
      .prepare(
        `
      UPDATE Jobs
      SET status = ?, updated_at = ?
      WHERE id = ?
      RETURNING id, company, title, jd_text, status,
                created_at, updated_at
    `,
      )
      .get(input.status, now, jobId) as Job;

    db.prepare(
      `
      INSERT INTO Job_Events (job_id, status, occurred_at, notes)
      VALUES (?, ?, ?, ?)
    `,
    ).run(jobId, input.status, now, input.notes ?? "");

    return { kind: "updated", job: updatedJob };
  });

  return update();
}

export interface JobEvent {
  id: number;
  job_id: number;
  status: JobStatus;
  occurred_at: string;
  notes: string;
  created_at: string;
}

export interface JobDetail extends Job {
  events: JobEvent[];
}

export function getJobDetail(
  db: Database.Database,
  jobId: number,
): JobDetail | undefined {
  const job = db
    .prepare(
      `
    SELECT id, company, title, jd_text, status,
           created_at, updated_at
    FROM Jobs
    WHERE id = ?
  `,
    )
    .get(jobId) as Job | undefined;

  if (!job) {
    return undefined;
  }

  const events = db
    .prepare(
      `
    SELECT id, job_id, status, occurred_at, notes, created_at
    FROM Job_Events
    WHERE job_id = ?
    ORDER BY occurred_at ASC, id ASC
  `,
    )
    .all(jobId) as JobEvent[];

  return { ...job, events };
}

export interface UpdateJobInput {
  company?: string;
  title?: string;
  jd_text?: string;
}

export function updateJob(
  db: Database.Database,
  jobId: number,
  input: UpdateJobInput,
): Job | undefined {
  return db
    .prepare(
      `
    UPDATE Jobs
    SET company = COALESCE(?, company),
        title = COALESCE(?, title),
        jd_text = COALESCE(?, jd_text),
        updated_at = ?
    WHERE id = ?
    RETURNING id, company, title, jd_text, status,
              created_at, updated_at
  `,
    )
    .get(
      input.company ?? null,
      input.title ?? null,
      input.jd_text ?? null,
      new Date().toISOString(),
      jobId,
    ) as Job | undefined;
}
