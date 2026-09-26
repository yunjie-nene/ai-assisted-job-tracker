# Next Chapter Frontend

The React + TypeScript frontend for AI-Assisted Job Tracker.

See the [project README](../README.md) for installation and local startup.

## Development

Run commands from the `frontend` directory.

```bash
npm run dev
```

Vite forwards `/api` requests to `http://localhost:3000`.
Set `API_PROXY_TARGET` when starting Vite to use a different backend address.

## Checks

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check TypeScript |
| `npm run lint` | Check code quality |
| `npm run test:config` | Test deployment configuration |
| `npm run build` | Generate the production build |
| `npm test` | Run browser workflow tests |
| `npm run format` | Format source files |
| `npm run format:check` | Check source formatting |

Install the test browser before the first browser test run:

```bash
npx playwright install chromium
npm test
```

Browser tests start a Vite server on port 5174 and the real backend on
port 3101 with an isolated in-memory database. They do not load the
backend `.env` file or modify the development database.

AI responses and production authentication are mocked during browser tests.
Tests do not call Gemini.

## Deployment

Follow the [deployment guide](../docs/DEPLOYMENT.md).

Once the backend has a working HTTPS address, configure the API destination:

```bash
npm run configure:deploy -- https://your-real-api-domain
```

The default placeholder destination intentionally blocks Vercel builds
until a real API origin is configured.

Never put Gemini keys or shared passwords in frontend environment variables.