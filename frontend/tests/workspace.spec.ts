import { test, expect, type APIRequestContext } from "@playwright/test";

const api = "http://localhost:3101";
async function addJob(
  request: APIRequestContext,
  values: Record<string, unknown> = {},
) {
  const response = await request.post(`${api}/jobs`, {
    data: {
      company: "Acme",
      title: "Full Stack Engineer",
      jd_text: "Build useful software.",
      ...values,
    },
  });
  expect(response.status()).toBe(201);
  return response.json() as Promise<{ id: number }>;
}

test.beforeEach(async ({ request }) => {
  const jobs = (await (await request.get(`${api}/jobs`)).json()) as {
    id: number;
  }[];
  for (const job of jobs)
    expect((await request.delete(`${api}/jobs/${job.id}`)).status()).toBe(204);
});

test("creates, edits, tracks status history, persists after reload, and confirms deletion", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Your next opportunity belongs here."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New application", exact: true })
    .click();
  await page.getByLabel("Company", { exact: true }).fill("Acme");
  await page
    .getByLabel("Job title", { exact: true })
    .fill("Full Stack Engineer");
  await page
    .getByRole("textbox", { name: "Job description", exact: true })
    .fill("Build useful software.");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Full Stack Engineer", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit application", exact: true })
    .click();
  await page
    .getByLabel("Job title", { exact: true })
    .fill("Senior Full Stack Engineer");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Senior Full Stack Engineer",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Application status", exact: true })
    .selectOption("applied");
  await page
    .getByLabel("Status note")
    .fill("Submitted through the careers page.");
  await page
    .getByRole("button", { name: "Update status", exact: true })
    .click();
  await expect(page.locator(".timeline")).toContainText(
    "Submitted through the careers page.",
  );
  await expect(
    page.getByRole("button", { name: "Update status", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Senior Full Stack Engineer",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".timeline")).toContainText(
    "Submitted through the careers page.",
  );
  await page
    .getByRole("button", { name: "Delete application", exact: true })
    .click();
  await expect(page.getByText("This cannot be undone.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Senior Full Stack Engineer",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete application", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Your next opportunity belongs here."),
  ).toBeVisible();
});

test("manages interview time, types, outcome, clearing fields, and independent status", async ({
  page,
  request,
}) => {
  const job = await addJob(request);
  await page.goto(`/#job/${job.id}`);
  await page
    .getByRole("button", { name: "Add interview", exact: true })
    .click();
  await page
    .getByLabel("Interview title", { exact: true })
    .fill("Technical discussion");
  await page.getByLabel("Interview types").fill("Technical, Live coding");
  await page.getByLabel("Scheduled time").fill("2027-01-14T14:30");
  await page
    .getByRole("combobox", { name: "Interview status", exact: true })
    .selectOption("scheduled");
  await page
    .getByRole("textbox", { name: "Interview notes", exact: true })
    .fill("Review TypeScript fundamentals.");
  await page
    .getByRole("button", { name: "Save interview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Technical discussion", exact: true }),
  ).toBeVisible();
  const expectedUtc = await page.evaluate(() =>
    new Date("2027-01-14T14:30").toISOString(),
  );
  const created = await (
    await request.get(`${api}/jobs/${job.id}/interviews`)
  ).json();
  expect(created[0].scheduled_at).toBe(expectedUtc);
  expect(created[0].types).toEqual(["Technical", "Live coding"]);
  await expect(
    page.getByRole("combobox", { name: "Application status", exact: true }),
  ).toHaveValue("saved");
  await page
    .getByRole("button", { name: "Edit Technical discussion", exact: true })
    .click();
  await page.getByLabel("Scheduled time").fill("");
  await page.getByLabel("Interview types").fill("");
  await page
    .getByRole("textbox", { name: "Interview notes", exact: true })
    .fill("");
  await page
    .getByRole("combobox", { name: "Interview status", exact: true })
    .selectOption("completed");
  await page
    .getByRole("combobox", { name: "Outcome", exact: true })
    .selectOption("passed");
  await page
    .getByRole("button", { name: "Save interview", exact: true })
    .click();
  await expect(
    page.getByText("Outcome: Passed", { exact: true }),
  ).toBeVisible();
  const updated = await (
    await request.get(`${api}/jobs/${job.id}/interviews`)
  ).json();
  expect(updated[0]).toMatchObject({
    scheduled_at: null,
    types: [],
    notes: "",
    status: "completed",
    outcome: "passed",
  });
  await page
    .getByRole("button", { name: "Delete Technical discussion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByText(/No interviews yet/)).toBeVisible();
  expect((await request.get(`${api}/jobs/${job.id}`)).status()).toBe(200);
});

test("searches and filters applications and sorts by company", async ({
  page,
  request,
}) => {
  await addJob(request, {
    company: "Zebra Labs",
    title: "Platform Engineer",
    status: "interview",
  });
  await addJob(request, {
    company: "Amber Studio",
    title: "Frontend Developer",
    status: "applied",
  });
  await addJob(request, {
    company: "River Works",
    title: "Backend Developer",
    status: "offer",
  });
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: /^Interview\s+1$/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Zebra Labs");
  await page.getByRole("button", { name: /^All applications/ }).click();
  await page.getByLabel("Search applications").fill("DEVELOPER");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Search applications").fill("No such company");
  await expect(page.getByText("No matching applications")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Sort applications").selectOption("company");
  await expect(page.locator("tbody tr").first()).toContainText("Amber Studio");
});

test("AI extraction requires review, preserves original description, and does not save skills", async ({
  page,
  request,
}) => {
  await page.route("**/api/ai/parse-job", (route) =>
    route.fulfill({
      json: {
        company: "Acme",
        title: "AI Engineer",
        skills: ["TypeScript", "React"],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "New application", exact: true })
    .click();
  const original =
    "  Acme is hiring an AI Engineer.\nReact and TypeScript required.  ";
  await page
    .getByRole("textbox", { name: "Job description", exact: true })
    .fill(original);
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue("Acme");
  await expect(page.getByLabel("Job title", { exact: true })).toHaveValue(
    "AI Engineer",
  );
  await expect(
    page.getByText("Skills are a preview only and are not saved.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(await (await request.get(`${api}/jobs`)).json()).toEqual([]);
  await page
    .getByLabel("Job title", { exact: true })
    .fill("Reviewed AI Engineer");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Reviewed AI Engineer", exact: true }),
  ).toBeVisible();
  const saved = await (await request.get(`${api}/jobs`)).json();
  expect(saved[0].jd_text).toBe(original);
  expect(saved[0]).not.toHaveProperty("skills");
});

test("AI parsing disables duplicate requests, handles timeout and retries", async ({
  page,
}) => {
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ai/parse-job", async (route) => {
    calls += 1;
    if (calls === 1) {
      await gate;
      await route.fulfill({
        status: 504,
        json: { error: "AI parsing timed out. Please try again." },
      });
    } else
      await route.fulfill({ json: { company: null, title: null, skills: [] } });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "New application", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Job description", exact: true })
    .fill("A vague job description.");
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Extracting…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save application", exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("AI parsing timed out.");
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await expect(
    page.getByText("No explicit skills found.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Job description", exact: true }),
  ).toHaveValue("A vague job description.");
  expect(calls).toBe(2);
});

test("recovers from a list error without showing a false empty state", async ({
  page,
}) => {
  await page.route("**/api/jobs", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Server temporarily unavailable." },
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Server temporarily unavailable.",
  );
  await expect(
    page.getByText("Your next opportunity belongs here."),
  ).toHaveCount(0);
  await page.unroute("**/api/jobs");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("Your next opportunity belongs here."),
  ).toBeVisible();
});

test("preserves form input after save failure and allows retry", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New application", exact: true })
    .click();
  await page.getByLabel("Company", { exact: true }).fill("Acme");
  await page.getByLabel("Job title", { exact: true }).fill("Engineer");
  await page.route("**/api/jobs", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 500,
          json: { error: "Unable to save right now." },
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Unable to save right now.",
  );
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue("Acme");
  await expect(page.getByLabel("Job title", { exact: true })).toHaveValue(
    "Engineer",
  );
  await page.unroute("**/api/jobs");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Engineer", exact: true }),
  ).toBeVisible();
});

test("handles a missing deep-linked application", async ({ page }) => {
  await page.goto("/#job/999999");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Job not found.",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/#job/);
});

test("uses in-memory credentials and clears access on sign-out and reload", async ({
  page,
}) => {
  const expected = `Basic ${Buffer.from("demo:example-password").toString("base64")}`;
  await page.route("**/api/**", (route) =>
    route.request().headers().authorization === expected
      ? route.continue()
      : route.fulfill({ status: 401, json: { error: "Sign in required." } }),
  );
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("demo");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sign in with your workspace",
  );
  await page.getByLabel("Password", { exact: true }).fill("example-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New application", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back.", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill("demo");
  await page.getByLabel("Password", { exact: true }).fill("example-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "New application", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back.", exact: true }),
  ).toBeVisible();
});

test("supports keyboard dismissal and a mobile layout without page overflow", async ({
  page,
  request,
}) => {
  await addJob(request, {
    company: "A company with a longer name",
    title: "Senior Full Stack Software Engineer",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "View Senior Full Stack Software Engineer at A company with a longer name",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "New application", exact: true })
    .click();
  await page.getByLabel("Company", { exact: true }).fill("Mobile Company");
  await page.getByLabel("Job title", { exact: true }).fill("Mobile Engineer");
  await page
    .getByRole("button", { name: "Save application", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mobile Engineer", exact: true }),
  ).toBeVisible();
});
