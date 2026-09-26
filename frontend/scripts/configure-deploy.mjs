import { writeFile } from "node:fs/promises";
import { makeConfig, normalizeOrigin } from "./deploy-config.mjs";

try {
  const origin = normalizeOrigin(process.argv[2] ?? "");
  await writeFile(
    new URL("../vercel.json", import.meta.url),
    `${JSON.stringify(makeConfig(origin), null, 2)}\n`,
  );
  console.log(
    "Updated vercel.json. Review the API destination before deploying.",
  );
} catch (error) {
  console.error(error.message);
  console.error("Usage: npm run configure:deploy -- https://your-api-domain");
  process.exitCode = 1;
}
