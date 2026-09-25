import type Database from "better-sqlite3";

export interface CreateInterviewInput {
  title: string;
  types?: string[];
  scheduled_at?: string | null;
  status?: "pending" | "scheduled" | "completed" | "cancelled";
  outcome?: "pending" | "passed" | "failed";
  notes?: string;
}

export type UpdateInterviewInput = Partial<CreateInterviewInput>;

export interface Interview {
  id: number;
  job_id: number;
  title: string;
  types: string[];
  scheduled_at: string | null;
  status: NonNullable<CreateInterviewInput["status"]>;
  outcome: NonNullable<CreateInterviewInput["outcome"]>;
  notes: string;
  created_at: string;
  updated_at: string;
}

type InterviewRow = Omit<Interview, "types"> & { types: string };

function toInterview(row: InterviewRow): Interview {
  return { ...row, types: JSON.parse(row.types) as string[] };
}

export function createInterview(
  db: Database.Database,
  jobId: number,
  input: CreateInterviewInput,
): Interview | undefined {
  const row = db.prepare(`
    INSERT INTO Interviews (job_id, title, types, scheduled_at, status, outcome, notes)
    SELECT id, ?, ?, ?, ?, ?, ? FROM Jobs WHERE id = ?
    RETURNING *
  `).get(
    input.title,
    JSON.stringify(input.types ?? []),
    input.scheduled_at ?? null,
    input.status ?? "pending",
    input.outcome ?? "pending",
    input.notes ?? "",
    jobId,
  ) as InterviewRow | undefined;

  return row ? toInterview(row) : undefined;
}

export function listInterviews(
  db: Database.Database,
  jobId: number,
): Interview[] | undefined {
  if (!db.prepare("SELECT id FROM Jobs WHERE id = ?").get(jobId)) {
    return undefined;
  }

  const rows = db.prepare(`
    SELECT * FROM Interviews
    WHERE job_id = ?
    ORDER BY scheduled_at IS NULL, scheduled_at ASC, id ASC
  `).all(jobId) as InterviewRow[];

  return rows.map(toInterview);
}

export function updateInterview(
  db: Database.Database,
  interviewId: number,
  input: UpdateInterviewInput,
): Interview | undefined {
  const row = db.prepare(`
    UPDATE Interviews
    SET title = COALESCE(?, title),
        types = COALESCE(?, types),
        scheduled_at = CASE WHEN ? THEN ? ELSE scheduled_at END,
        status = COALESCE(?, status),
        outcome = COALESCE(?, outcome),
        notes = COALESCE(?, notes),
        updated_at = ?
    WHERE id = ?
    RETURNING *
  `).get(
    input.title ?? null,
    input.types === undefined ? null : JSON.stringify(input.types),
    input.scheduled_at === undefined ? 0 : 1,
    input.scheduled_at ?? null,
    input.status ?? null,
    input.outcome ?? null,
    input.notes ?? null,
    new Date().toISOString(),
    interviewId,
  ) as InterviewRow | undefined;

  return row ? toInterview(row) : undefined;
}
