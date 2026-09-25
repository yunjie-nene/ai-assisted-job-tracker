import { test, expect } from "@playwright/test";

test("GET /health returns status ok", async ({ request }) => {
  const response = await request.get("/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toEqual({ status: "ok" });
});
