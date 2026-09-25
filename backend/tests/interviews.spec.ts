import { test, expect, type APIRequestContext } from "@playwright/test";
import type { Interview } from "../src/repositories/interviews.js";

async function createJob(request: APIRequestContext): Promise<number> {
  const response = await request.post("/jobs", {
    data: { company: "Interview Test Company", title: "Backend Engineer" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id;
}

async function createInterview(
  request: APIRequestContext,
  jobId: number,
  data: Record<string, unknown> = { title: "Technical round" },
): Promise<Interview> {
  const response = await request.post(`/jobs/${jobId}/interviews`, { data });
  expect(response.status()).toBe(201);
  return response.json();
}

async function listInterviews(request: APIRequestContext, jobId: number): Promise<Interview[]> {
  const response = await request.get(`/jobs/${jobId}/interviews`);
  expect(response.status()).toBe(200);
  return response.json();
}

test("creates an interview with defaults and persists it", async ({ request }) => {
  const jobId = await createJob(request);
  const interview = await createInterview(request, jobId, { title: "  Recruiter call  " });

  expect(interview).toEqual({
    id: expect.any(Number),
    job_id: jobId,
    title: "Recruiter call",
    types: [],
    scheduled_at: null,
    status: "pending",
    outcome: "pending",
    notes: "",
    created_at: expect.any(String),
    updated_at: expect.any(String),
  });
  expect(await listInterviews(request, jobId)).toEqual([interview]);
});

test("lists only the requested job's interviews in schedule order with unscheduled last", async ({ request }) => {
  const jobId = await createJob(request);
  const otherJobId = await createJob(request);
  const unscheduled = await createInterview(request, jobId);
  const later = await createInterview(request, jobId, {
    title: "System design", scheduled_at: "2026-10-02T08:00:00Z",
  });
  const first = await createInterview(request, jobId, {
    title: "Technical round",
    types: [" Coding ", "System design"],
    scheduled_at: "2026-10-02T09:00:00+02:00",
    status: "scheduled", outcome: "pending", notes: "Bring a laptop.",
  });
  const tied = await createInterview(request, jobId, {
    title: "Follow-up", scheduled_at: "2026-10-02T07:00:00Z",
  });
  await createInterview(request, otherJobId);

  expect(first).toMatchObject({
    types: ["Coding", "System design"],
    scheduled_at: "2026-10-02T07:00:00.000Z",
    status: "scheduled", outcome: "pending", notes: "Bring a laptop.",
  });
  expect(await listInterviews(request, jobId)).toEqual([first, tied, later, unscheduled]);
});

test("returns an empty list for an existing job without interviews", async ({ request }) => {
  expect(await listInterviews(request, await createJob(request))).toEqual([]);
});

test("partially updates an interview while preserving the job and its history", async ({ request }) => {
  const jobId = await createJob(request);
  const interview = await createInterview(request, jobId, {
    title: "Technical round", types: ["Coding"],
    scheduled_at: "2026-10-02T07:00:00Z", status: "scheduled",
    notes: "Bring a laptop.",
  });
  const jobBefore = await request.get(`/jobs/${jobId}`);
  expect(jobBefore.status()).toBe(200);
  const originalJob = await jobBefore.json();

  const response = await request.patch(`/interviews/${interview.id}`, {
    data: { status: "completed", outcome: "passed" },
  });
  expect(response.status()).toBe(200);
  const updated: Interview = await response.json();
  expect(updated).toEqual({
    ...interview, status: "completed", outcome: "passed", updated_at: expect.any(String),
  });
  expect(await listInterviews(request, jobId)).toEqual([updated]);
  const jobAfter = await request.get(`/jobs/${jobId}`);
  expect(jobAfter.status()).toBe(200);
  expect(await jobAfter.json()).toEqual(originalJob);
});

test("edits interview details and explicitly clears optional fields", async ({ request }) => {
  const jobId = await createJob(request);
  const interview = await createInterview(request, jobId, {
    title: "First round", types: ["Coding"],
    scheduled_at: "2026-10-02T07:00:00Z", notes: "Original notes.",
  });
  const editedResponse = await request.patch(`/interviews/${interview.id}`, {
    data: {
      title: "  Final round  ", types: ["  Culture  ", "Leadership"],
      scheduled_at: "2026-10-03T10:00:00+02:00", notes: "Meet the team.",
    },
  });
  expect(editedResponse.status()).toBe(200);
  const edited: Interview = await editedResponse.json();
  expect(edited).toEqual({
    ...interview, title: "Final round", types: ["Culture", "Leadership"],
    scheduled_at: "2026-10-03T08:00:00.000Z", notes: "Meet the team.",
    updated_at: expect.any(String),
  });

  const clearedResponse = await request.patch(`/interviews/${interview.id}`, {
    data: { types: [], scheduled_at: null, notes: "", status: "cancelled" },
  });
  expect(clearedResponse.status()).toBe(200);
  const cleared = await clearedResponse.json();
  expect(cleared).toEqual({
    ...edited, types: [], scheduled_at: null, notes: "", status: "cancelled",
    updated_at: expect.any(String),
  });
  expect(await listInterviews(request, jobId)).toEqual([cleared]);
});

test("returns 404 for missing jobs and interviews", async ({ request }) => {
  const missingId = Number.MAX_SAFE_INTEGER;
  for (const response of [
    await request.get(`/jobs/${missingId}/interviews`),
    await request.post(`/jobs/${missingId}/interviews`, { data: { title: "First round" } }),
  ]) {
    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: "Job not found." });
  }
  const response = await request.patch(`/interviews/${missingId}`, { data: { notes: "Updated" } });
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: "Interview not found." });
});

test("rejects invalid IDs on all interview routes", async ({ request }) => {
  for (const id of ["abc", "0", "-1", "1.5", "9007199254740992"]) {
    for (const response of [
      await request.get(`/jobs/${id}/interviews`),
      await request.post(`/jobs/${id}/interviews`, { data: { title: "First round" } }),
      await request.patch(`/interviews/${id}`, { data: { notes: "Updated" } }),
    ]) {
      expect(response.status()).toBe(400);
    }
  }
});

test("rejects invalid interview fields without changing stored data", async ({ request }) => {
  const jobId = await createJob(request);
  const interview = await createInterview(request, jobId);
  const invalidFields = [
    { title: "   " }, { title: null },
    { types: "Coding" }, { types: [123] }, { types: [" "] }, { types: null },
    { scheduled_at: "tomorrow" }, { scheduled_at: "2026-02-30T12:00:00Z" },
    { scheduled_at: "2026-10-02T09:00:00" },
    { status: "unknown" }, { outcome: "unknown" }, { notes: 123 },
    { job_id: jobId + 1 }, { id: interview.id }, { created_at: "2026-01-01T00:00:00Z" },
  ];
  for (const fields of invalidFields) {
    for (const response of [
      await request.post(`/jobs/${jobId}/interviews`, { data: { title: "First round", ...fields } }),
      await request.patch(`/interviews/${interview.id}`, { data: fields }),
    ]) {
      expect(response.status()).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "Invalid request body.", issues: expect.any(Array),
      });
    }
  }
  for (const response of [
    await request.post(`/jobs/${jobId}/interviews`, { data: {} }),
    await request.patch(`/interviews/${interview.id}`, { data: {} }),
  ]) {
    expect(response.status()).toBe(400);
  }
  expect(await listInterviews(request, jobId)).toEqual([interview]);
});
