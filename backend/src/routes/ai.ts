import { Router } from "express";
import { z } from "zod";
import { AiTimeoutError, parseJobDescription } from "../services/job-parser.js";

const parseJobRequestSchema = z
  .object({
    jd_text: z.string().trim().min(1).max(20_000),
  })
  .strict();

export function createAiRouter(
  parseJob: typeof parseJobDescription = parseJobDescription,
) {
  const router = Router();

  router.post("/ai/parse-job", async (req, res) => {
    const body = parseJobRequestSchema.safeParse(req.body);

    if (!body.success) {
      res.status(400).json({
        error: "Invalid request body.",
        issues: body.error.issues,
      });
      return;
    }

    try {
      const job = await parseJob(body.data.jd_text);
      res.status(200).json(job);
    } catch (error) {
      if (error instanceof AiTimeoutError) {
        res.status(504).json({
          error: "AI parsing timed out. Please try again.",
        });
        return;
      }

      res.status(502).json({
        error: "Unable to parse the job description. Please try again later.",
      });
    }
  });

  return router;
}
