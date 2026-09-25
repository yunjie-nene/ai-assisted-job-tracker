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

test("updates a job status", async ({ request }) => {
  const created = await request.post("/jobs", {
    data: {
      company: "Example Company",
      title: "Software Engineer",
      status: "applied",
    },
  });
  expect(created.status()).toBe(201);
  const job = await created.json();

  const response = await request.patch(`/jobs/${job.id}/status`, {
    data: {
      status: "interview",
      notes: "Received an interview invitation",
    },
  });

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    id: job.id,
    company: job.company,
    title: job.title,
    status: "interview",
    created_at: job.created_at,
  });
});

test("rejects invalid status update requests", async ({ request }) => {
  const cases = [
    { id: "abc", body: { status: "interview" } },
    { id: "0", body: { status: "interview" } },
    { id: "1", body: {} },
    { id: "1", body: { status: "unknown" } },
    { id: "1", body: { status: "interview", notes: 123 } },
  ];

  for (const { id, body } of cases) {
    const response = await request.patch(`/jobs/${id}/status`, {
      data: body,
    });

    expect(response.status()).toBe(400);
  }
});

test("returns 404 when the job does not exist", async ({ request }) => {
  const response = await request.patch("/jobs/9007199254740991/status", {
    data: { status: "interview" },
  });

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: "Job not found.",
  });
});

test("returns 409 when the status is unchanged", async ({ request }) => {
  const created = await request.post("/jobs", {
    data: {
      company: "Example Company",
      title: "Software Engineer",
      status: "applied",
    },
  });
  expect(created.status()).toBe(201);
  const job = await created.json();

  const response = await request.patch(`/jobs/${job.id}/status`, {
    data: { status: "applied" },
  });

  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({
    error: "Job already has this status.",
  });
});

test("returns job details with status history in chronological order", async ({
  request,
}) => {
  const created = await request.post("/jobs", {
    data: {
      company: "Example Company",
      title: "Software Engineer",
      jd_text: "Build backend services.",
      status: "applied",
    },
  });
  expect(created.status()).toBe(201);
  const job = await created.json();

  const updated = await request.patch(`/jobs/${job.id}/status`, {
    data: {
      status: "interview",
      notes: "Received an interview invitation",
    },
  });
  expect(updated.status()).toBe(200);
  const updatedJob = await updated.json();

  const response = await request.get(`/jobs/${job.id}`);

  expect(response.status()).toBe(200);

  const detail = await response.json();

  expect(detail).toEqual({
    ...updatedJob,
    events: [
      {
        id: expect.any(Number),
        job_id: job.id,
        status: "applied",
        occurred_at: job.created_at,
        notes: "",
        created_at: expect.any(String),
      },
      {
        id: expect.any(Number),
        job_id: job.id,
        status: "interview",
        occurred_at: updatedJob.updated_at,
        notes: "Received an interview invitation",
        created_at: expect.any(String),
      },
    ],
  });
});

test("returns 404 for a missing job detail", async ({ request }) => {
  const response = await request.get("/jobs/9007199254740991");

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: "Job not found.",
  });
});

test("rejects invalid job detail IDs", async ({ request }) => {
  for (const id of ["abc", "0", "-1", "1.5"]) {
    const response = await request.get(`/jobs/${id}`);

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid job ID.",
    });
  }
});

test("updates provided job fields and preserves status history", async ({
  request,
}) => {
  const created = await request.post("/jobs", {
    data: {
      company: "Original Company",
      title: "Software Engineer",
      jd_text: "Build backend services.",
      status: "applied",
    },
  });
  expect(created.status()).toBe(201);
  const job = await created.json();

  const beforeResponse = await request.get(`/jobs/${job.id}`);
  expect(beforeResponse.status()).toBe(200);
  const before = await beforeResponse.json();

  const response = await request.patch(`/jobs/${job.id}`, {
    data: { company: "  Updated Company  " },
  });

  expect(response.status()).toBe(200);
  const updated = await response.json();

  expect(updated).toEqual({
    ...job,
    company: "Updated Company",
    updated_at: expect.any(String),
  });

  const afterResponse = await request.get(`/jobs/${job.id}`);
  expect(afterResponse.status()).toBe(200);

  expect(await afterResponse.json()).toEqual({
    ...updated,
    events: before.events,
  });
});

test("updates the job title and allows clearing the JD", async ({
  request,
}) => {
  const created = await request.post("/jobs", {
    data: {
      company: "Example Company",
      title: "Software Engineer",
      jd_text: "Original description.",
    },
  });
  expect(created.status()).toBe(201);
  const job = await created.json();

  const response = await request.patch(`/jobs/${job.id}`, {
    data: {
      title: "  Backend Engineer  ",
      jd_text: "",
    },
  });

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    id: job.id,
    company: job.company,
    title: "Backend Engineer",
    jd_text: "",
    status: job.status,
  });
});

test("rejects invalid job edits", async ({ request }) => {
  const cases = [
    { id: "abc", body: { company: "Example Company" } },
    { id: "1", body: {} },
    { id: "1", body: { company: "   " } },
    { id: "1", body: { title: "" } },
    { id: "1", body: { jd_text: 123 } },
    { id: "1", body: { company: null } },
    { id: "1", body: { status: "offer" } },
    {
      id: "1",
      body: { company: "Example Company", status: "offer" },
    },
  ];

  for (const { id, body } of cases) {
    const response = await request.patch(`/jobs/${id}`, {
      data: body,
    });

    expect(response.status()).toBe(400);
  }
});

test("returns 404 when editing a missing job", async ({ request }) => {
  const response = await request.patch("/jobs/9007199254740991", {
    data: { company: "Updated Company" },
  });

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    error: "Job not found.",
  });
});
