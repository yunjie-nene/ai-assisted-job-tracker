import express, { type ErrorRequestHandler } from "express";
import type Database from "better-sqlite3";
import { z } from "zod";
import { createJob, listJobs } from "./repositories/jobs.js";

const createJobSchema = z.object({
  company: z.string().trim().min(1),
  title: z.string().trim().min(1),
  jd_text: z.string().default(""),
  status: z
    .enum(["saved", "applied", "interview", "offer", "rejected", "withdrawn"])
    .default("saved"),
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

  return app;
}
