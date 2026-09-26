import { readFile } from "node:fs/promises";
import { normalizeOrigin } from "./deploy-config.mjs";

if (process.env.VERCEL === "1") {
  try {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    );
    const destination = config.rewrites.find(
      (rule) => rule.source === "/api/:path*",
    )?.destination;
    if (!destination?.endsWith("/:path*"))
      throw new Error("Missing API rewrite.");
    normalizeOrigin(destination.slice(0, -"/:path*".length));
  } catch {
    console.error(
      "Deployment blocked: run npm run configure:deploy -- https://your-api-domain and include vercel.json in the deployment.",
    );
    process.exitCode = 1;
  }
}
