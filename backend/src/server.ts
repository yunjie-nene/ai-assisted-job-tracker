import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const server = app.listen(port, "localhost", () => {
  console.log(`API running at http://localhost:${port}`);
});

server.on("error", (error) => {
  console.error("Failed to start server:", error.message);
  process.exitCode = 1;
});
