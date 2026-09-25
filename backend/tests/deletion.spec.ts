import { test, expect, type APIRequestContext } from "@playwright/test";

async function createJob(request: APIRequestContext): Promise<number> {
  const response = await request.post("/jobs", {
    data: { company: "Deletion Test Company", title: "Backend Engineer" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id;
}

async function createInterview(request: APIRequestContext, jobId: number): Promise<number> {
  const response = await request.post(`/jobs/${jobId}/interviews`, {
    data: { title: "Technical round" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).id;
}

test("deletes one interview without changing its job, history or other interviews", async ({ request }) => {
  const jobId = await createJob(request);
  const removedId = await createInterview(request, jobId);
  const keptId = await createInterview(request, jobId);
  const beforeResponse = await request.get(`/jobs/${jobId}`);
  expect(beforeResponse.status()).toBe(200);
  const before = await beforeResponse.json();

  const response = await request.delete(`/interviews/${removedId}`);
  expect(response.status()).toBe(204);
  expect(await response.text()).toBe("");

  const list = await request.get(`/jobs/${jobId}/interviews`);
  expect(list.status()).toBe(200);
  expect(await list.json()).toEqual([expect.objectContaining({ id: keptId })]);
  const afterResponse = await request.get(`/jobs/${jobId}`);
  expect(afterResponse.status()).toBe(200);
  expect(await afterResponse.json()).toEqual(before);

  const repeated = await request.delete(`/interviews/${removedId}`);
  expect(repeated.status()).toBe(404);
  expect(await repeated.json()).toEqual({ error: "Interview not found." });
});

test("deletes a job and makes its interviews unavailable", async ({ request }) => {
  const jobId = await createJob(request);
  const interviewId = await createInterview(request, jobId);

  const response = await request.delete(`/jobs/${jobId}`);
  expect(response.status()).toBe(204);
  expect(await response.text()).toBe("");

  for (const missing of [
    await request.get(`/jobs/${jobId}`),
    await request.get(`/jobs/${jobId}/interviews`),
    await request.delete(`/jobs/${jobId}`),
  ]) {
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toEqual({ error: "Job not found." });
  }
  const interviewResponse = await request.patch(`/interviews/${interviewId}`, {
    data: { notes: "Updated notes" },
  });
  expect(interviewResponse.status()).toBe(404);
  expect(await interviewResponse.json()).toEqual({ error: "Interview not found." });
});

test("rejects invalid deletion IDs and reports missing records", async ({ request }) => {
  for (const resource of ["jobs", "interviews"]) {
    for (const id of ["abc", "0", "-1", "1.5", "9007199254740992"]) {
      const response = await request.delete(`/${resource}/${id}`);
      expect(response.status()).toBe(400);
    }
    const response = await request.delete(`/${resource}/${Number.MAX_SAFE_INTEGER}`);
    expect(response.status()).toBe(404);
  }
});
