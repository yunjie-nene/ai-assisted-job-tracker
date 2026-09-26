import test from "node:test";
import assert from "node:assert/strict";
import { makeConfig, normalizeOrigin } from "./deploy-config.mjs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("only accepts an HTTPS origin without credentials or extra URL components", () => {
  for (const input of [
    "http://api.company.test",
    "https://name:password@api.company.test",
    "https://api.company.test/path",
    "https://api.company.test?key=value",
    "https://api.company.test#secret",
    "https://api.company.test:8443",
    "https://api.job-tracker.invalid",
    "https://api.example.com",
    "https://localhost",
    "",
  ]) {
    assert.throws(() => normalizeOrigin(input));
  }
  assert.equal(
    normalizeOrigin("https://api.company.test/"),
    "https://api.company.test",
  );
});

test("proxy routing strips the local prefix and disables all API response caching", () => {
  const config = makeConfig("https://api.company.test");
  assert.deepEqual(config.rewrites, [
    { source: "/api/:path*", destination: "https://api.company.test/:path*" },
  ]);
  const headers = Object.fromEntries(
    config.headers[0].headers.map(({ key, value }) => [key, value]),
  );
  assert.equal(headers["Cache-Control"], "private, no-store");
  assert.equal(headers["Vercel-CDN-Cache-Control"], "no-store");
  assert.equal(headers["x-vercel-enable-rewrite-caching"], "0");
});

test("Vercel build guard blocks the placeholder and accepts a configured origin", async () => {
  const directory = await mkdtemp(join(tmpdir(), "job-tracker-config-"));
  try {
    await mkdir(join(directory, "scripts"));
    for (const name of ["deploy-config.mjs", "check-deploy.mjs"]) {
      await copyFile(
        new URL(name, import.meta.url),
        join(directory, "scripts", name),
      );
    }
    const run = () =>
      spawnSync(
        process.execPath,
        [join(directory, "scripts/check-deploy.mjs")],
        { env: { ...process.env, VERCEL: "1" }, encoding: "utf8" },
      );
    await writeFile(
      join(directory, "vercel.json"),
      JSON.stringify(makeConfig("https://api.job-tracker.invalid")),
    );
    assert.equal(run().status, 1);
    await writeFile(
      join(directory, "vercel.json"),
      JSON.stringify(makeConfig("https://api.company.test")),
    );
    assert.equal(run().status, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
