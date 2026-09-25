import { Router } from "express";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  createInterview,
  listInterviews,
  updateInterview,
} from "../repositories/interviews.js";

const idSchema = z.string().regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

const interviewFields = z.object({
  title: z.string().trim().min(1),
  types: z.array(z.string().trim().min(1)),
  scheduled_at: z.iso.datetime({ offset: true })
    .transform((value) => new Date(value).toISOString())
    .nullable(),
  status: z.enum(["pending", "scheduled", "completed", "cancelled"]),
  outcome: z.enum(["pending", "passed", "failed"]),
  notes: z.string(),
});

const createInterviewSchema = interviewFields.partial().extend({
  title: interviewFields.shape.title,
}).strict();

const updateInterviewSchema = interviewFields.partial().strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Provide at least one field to update." },
);

export function createInterviewsRouter(db: Database.Database) {
  const router = Router();

  router.post("/jobs/:id/interviews", (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid job ID." });
      return;
    }

    const body = createInterviewSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: "Invalid request body.",
        issues: body.error.issues,
      });
      return;
    }

    const interview = createInterview(db, id.data, body.data);
    if (!interview) {
      res.status(404).json({ error: "Job not found." });
      return;
    }

    res.status(201).json(interview);
  });

  router.get("/jobs/:id/interviews", (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid job ID." });
      return;
    }

    const interviews = listInterviews(db, id.data);
    if (!interviews) {
      res.status(404).json({ error: "Job not found." });
      return;
    }

    res.status(200).json(interviews);
  });

  router.patch("/interviews/:id", (req, res) => {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: "Invalid interview ID." });
      return;
    }

    const body = updateInterviewSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({
        error: "Invalid request body.",
        issues: body.error.issues,
      });
      return;
    }

    const interview = updateInterview(db, id.data, body.data);
    if (!interview) {
      res.status(404).json({ error: "Interview not found." });
      return;
    }

    res.status(200).json(interview);
  });

  return router;
}
