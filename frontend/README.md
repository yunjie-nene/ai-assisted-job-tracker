# Next Chapter frontend

React + TypeScript + Vite workspace for the existing Job Tracker API.

Use Node 24 and run `npm ci` followed by `npm run dev` from this directory.
Start the existing backend separately. The `/api` proxy targets
`http://localhost:3000` unless `API_PROXY_TARGET` is set.

Check this stage with `npm run typecheck`, `npm run lint`, and `npm run build`.

Install Chromium with `npx playwright install chromium`, then run `npm test`.
The tests use isolated in-memory backend data on port 3101 and Vite on port 5174.
AI responses and the production login gateway are mocked. No real AI key is read.
