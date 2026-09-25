import express, { type ErrorRequestHandler } from "express";
import type Database from "better-sqlite3";
import { z } from "zod";
import { createInterviewsRouter } from "./routes/interviews.js";
import {
  createJob,
  getJobDetail,
  listJobs,
  updateJob,
  updateJobStatus,
} from "./repositories/jobs.js";
import { createAiRouter } from "./routes/ai.js";

const createJobSchema = z.object({
  company: z.string().trim().min(1),
  title: z.string().trim().min(1),
  jd_text: z.string().default(""),
  status: z
    .enum(["saved", "applied", "interview", "offer", "rejected", "withdrawn"])
    .default("saved"),
});

const jobIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

const updateJobStatusSchema = z.object({
  status: z.enum([
    "saved",
    "applied",
    "interview",
    "offer",
    "rejected",
    "withdrawn",
  ]),
  notes: z.string().trim().default(""),
});

const updateJobSchema = z
  .object({
    company: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    jd_text: z.string().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

export function createApp(db: Database.Database) {
  const app = express();

  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/jobs", (_req, res) => {
    const jobs = listJobs(db);
    res.status(200).json(jobs);
  });

  app.get("/jobs/:id", (req, res) => {
    const idResult = jobIdSchema.safeParse(req.params.id);

    if (!idResult.success) {
      res.status(400).json({ error: "Invalid job ID." });
      return;
    }

    const job = getJobDetail(db, idResult.data);

    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }

    res.status(200).json(job);
  });

  app.post("/jobs", (req, res) => {
    const result = createJobSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        error: "Invalid request body.",
        issues: result.error.issues,
      });
      return;
    }

    const job = createJob(db, result.data);
    res.status(201).json(job);
  });

  app.patch("/jobs/:id/status", (req, res) => {
    const idResult = jobIdSchema.safeParse(req.params.id);

    if (!idResult.success) {
      res.status(400).json({ error: "Invalid job ID." });
      return;
    }

    const bodyResult = updateJobStatusSchema.safeParse(req.body);

    if (!bodyResult.success) {
      res.status(400).json({
        error: "Invalid request body.",
        issues: bodyResult.error.issues,
      });
      return;
    }

    const result = updateJobStatus(db, idResult.data, bodyResult.data);

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Job not found." });
      return;
    }

    if (result.kind === "unchanged") {
      res.status(409).json({
        error: "Job already has this status.",
      });
      return;
    }

    res.status(200).json(result.job);
  });

  app.patch("/jobs/:id", (req, res) => {
    const idResult = jobIdSchema.safeParse(req.params.id);

    if (!idResult.success) {
      res.status(400).json({ error: "Invalid job ID." });
      return;
    }

    const bodyResult = updateJobSchema.safeParse(req.body);

    if (!bodyResult.success) {
      res.status(400).json({
        error: "Invalid request body.",
        issues: bodyResult.error.issues,
      });
      return;
    }

    const job = updateJob(db, idResult.data, bodyResult.data);

    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }

    res.status(200).json(job);
  });

  app.use(createInterviewsRouter(db));

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Invalid JSON." });
      return;
    }

    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "Request body is too large." });
      return;
    }

    console.error("Request failed:", error);
    res.status(500).json({ error: "Internal server error." });
  };

  app.use(errorHandler);
  app.use(createAiRouter());

  return app;
}
