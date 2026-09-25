import { test, expect } from "@playwright/test";
import { Job } from "../src/repositories/jobs.js";

test("POST /jobs creates an application", async ({ request }) => {
  const response = await request.post("/jobs", {
    data: {
      company: "  Example Company  ",
      title: "  Software Engineer  ",
      jd_text: "TypeScript, React and SQL",
      status: "applied",
    },
  });

  expect(response.status()).toBe(201);

  const job = await response.json();

  expect(job).toMatchObject({
    company: "Example Company",
    title: "Software Engineer",
    jd_text: "TypeScript, React and SQL",
    status: "applied",
  });

  expect(job.id).toEqual(expect.any(Number));
  expect(job.id).toBeGreaterThan(0);
  expect(job.created_at).toEqual(expect.any(String));
  expect(job.updated_at).toEqual(expect.any(String));
});

test("POST /jobs supplies defaults for optional fields", async ({
  request,
}) => {
  const response = await request.post("/jobs", {
    data: {
      company: "Another Company",
      title: "Backend Developer",
    },
  });

  expect(response.status()).toBe(201);

  expect(await response.json()).toMatchObject({
    company: "Another Company",
    title: "Backend Developer",
    jd_text: "",
    status: "saved",
  });
});

const invalidCases = [
  {
    name: "blank company",
    body: {
      company: "   ",
      title: "Software Engineer",
    },
    field: "company",
  },
  {
    name: "invalid status",
    body: {
      company: "Example Company",
      title: "Software Engineer",
      status: "unknown",
    },
    field: "status",
  },
  {
    name: "non-string JD",
    body: {
      company: "Example Company",
      title: "Software Engineer",
      jd_text: 123,
    },
    field: "jd_text",
  },
];

for (const example of invalidCases) {
  test(`POST /jobs rejects ${example.name}`, async ({ request }) => {
    const response = await request.post("/jobs", {
      data: example.body,
    });

    expect(response.status()).toBe(400);

    const body = await response.json();

    expect(body.error).toBe("Invalid request body.");
    expect(body.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: [example.field],
        }),
      ]),
    );
  });
}

test("GET /jobs returns created jobs in newest-first order", async ({
  request,
}) => {
  const firstResponse = await request.post("/jobs", {
    data: {
      company: "List Test Company",
      title: "First Position",
    },
  });

  expect(firstResponse.status()).toBe(201);
  const firstJob: Job = await firstResponse.json();

  const secondResponse = await request.post("/jobs", {
    data: {
      company: "List Test Company",
      title: "Second Position",
    },
  });

  expect(secondResponse.status()).toBe(201);
  const secondJob: Job = await secondResponse.json();

  const response = await request.get("/jobs");

  expect(response.status()).toBe(200);

  const jobs: Job[] = await response.json();

  expect(jobs).toEqual(expect.any(Array));
  expect(jobs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: firstJob.id,
        title: "First Position",
      }),
      expect.objectContaining({
        id: secondJob.id,
        title: "Second Position",
      }),
    ]),
  );

  const createdJobs = jobs.filter(
    (job) => job.id === firstJob.id || job.id === secondJob.id,
  );

  expect(createdJobs.map((job) => job.id)).toEqual([secondJob.id, firstJob.id]);
});
