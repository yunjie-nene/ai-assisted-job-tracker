import { test, expect } from "@playwright/test";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createAiRouter } from "../src/routes/ai.js";
import type { ParsedJob } from "../src/services/job-parser.js";

type JobParser = (jdText: string) => Promise<ParsedJob>;

async function withAiServer(
  parser: JobParser,
  run: (baseURL: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  app.use(createAiRouter(parser));

  const server = createServer(app);
  server.listen(0, "127.0.0.1");

  try {
    await once(server, "listening");

    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

test("returns parsed job data and passes trimmed JD to the parser", async ({
  request,
}) => {
  const receivedInputs: string[] = [];

  const expectedJob: ParsedJob = {
    company: "Example Company",
    title: "Backend Engineer",
    skills: ["TypeScript", "SQL"],
  };

  const fakeParser: JobParser = async (jdText) => {
    receivedInputs.push(jdText);
    return expectedJob;
  };

  await withAiServer(fakeParser, async (baseURL) => {
    const response = await request.post(`${baseURL}/ai/parse-job`, {
      data: {
        jd_text: "  Example Company is hiring a Backend Engineer.  ",
      },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(expectedJob);
    expect(receivedInputs).toEqual([
      "Example Company is hiring a Backend Engineer.",
    ]);
  });
});

test("rejects invalid input without calling the parser", async ({
  request,
}) => {
  let callCount = 0;

  const fakeParser: JobParser = async () => {
    callCount += 1;
    return { company: null, title: null, skills: [] };
  };

  await withAiServer(fakeParser, async (baseURL) => {
    const invalidBodies = [
      {},
      { jd_text: "" },
      { jd_text: "   " },
      { jd_text: 123 },
      { jd_text: null },
      { jd_text: "a".repeat(20_001) },
      { jd_text: "Valid description.", unexpected: true },
    ];

    for (const body of invalidBodies) {
      const response = await request.post(`${baseURL}/ai/parse-job`, {
        data: body,
      });

      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "Invalid request body.",
        issues: expect.any(Array),
      });
    }

    expect(callCount).toBe(0);
  });
});

test("returns a generic 502 response when the parser fails", async ({
  request,
}) => {
  const fakeParser: JobParser = async () => {
    throw new Error("Internal provider failure details");
  };

  await withAiServer(fakeParser, async (baseURL) => {
    const response = await request.post(`${baseURL}/ai/parse-job`, {
      data: { jd_text: "Example Company is hiring a Backend Engineer." },
    });

    expect(response.status()).toBe(502);
    expect(await response.json()).toEqual({
      error: "Unable to parse the job description. Please try again later.",
    });
  });
});

test("the main application mounts the AI route", async ({ request }) => {
  const response = await request.post("/ai/parse-job", {
    data: { jd_text: "" },
  });

  expect(response.status()).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "Invalid request body.",
    issues: expect.any(Array),
  });
});
