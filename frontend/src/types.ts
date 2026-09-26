export const jobStatuses = [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type JobStatus = (typeof jobStatuses)[number];
export interface Job {
  id: number;
  company: string;
  title: string;
  jd_text: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
}
export interface JobEvent {
  id: number;
  status: JobStatus;
  occurred_at: string;
  notes: string;
}
export interface JobDetail extends Job {
  events: JobEvent[];
}
export type JobInput = Pick<Job, "company" | "title" | "jd_text" | "status">;
export const interviewStatuses = [
  "pending",
  "scheduled",
  "completed",
  "cancelled",
] as const;
export const interviewOutcomes = ["pending", "passed", "failed"] as const;
export interface InterviewInput {
  title: string;
  types: string[];
  scheduled_at: string | null;
  status: (typeof interviewStatuses)[number];
  outcome: (typeof interviewOutcomes)[number];
  notes: string;
}
export interface Interview extends InterviewInput {
  id: number;
  job_id: number;
  created_at: string;
  updated_at: string;
}
export interface ParsedJob {
  company: string | null;
  title: string | null;
  skills: string[];
}
