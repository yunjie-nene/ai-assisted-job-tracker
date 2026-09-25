# AI-Assisted Job Tracker

A personal job application tracker with flexible interview
timelines and AI-powered insights.

## Planned Features

- Track job applications and status changes
- Manage interviews with different rounds and types
- View application and interview timelines
- Extract key skills from job descriptions using Google Gemini
- Summarize application history and suggest improvements

## Planned Tech Stack

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript + Express
- Database: SQLite
- AI: Google Gemini API
- Testing: Playwright
- CI/CD: GitHub Actions
- Hosting: AWS EC2 + Vercel

## Status

Backend job creation, listing, details, status history, editing, and interview management are implemented. Frontend and AI features are planned.

## Interview API

- `POST /jobs/:id/interviews`: create an interview; only `title` is required.
- `GET /jobs/:id/interviews`: list interviews by scheduled time ascending, then ID; unscheduled interviews come last. An existing job with no interviews returns `[]`.
- `PATCH /interviews/:id`: update one or more interview fields; omitted fields are preserved.

Writable fields: `title`, `types` (an array of nonblank custom strings),
`scheduled_at` (an ISO 8601 timestamp with a timezone, or `null`), `status`,
`outcome`, and `notes`. Timestamps are normalized to UTC. Pass
`scheduled_at: null`, `types: []`, or `notes: ""` to clear those fields.

The default status is `pending`; accepted values are `pending`, `scheduled`,
`completed`, and `cancelled`. The default outcome is `pending`; accepted values
are `pending`, `passed`, and `failed`. Status, outcome, and scheduled time are
edited explicitly and independently. Interview changes do not change the job's
status or add job status events.

Invalid IDs or request bodies return `400`; missing jobs or interviews return
`404`. Unknown body fields and empty PATCH bodies are rejected.

Run backend checks from `backend/`: `npm run typecheck` and `npm test`.
The test command builds the backend and starts an isolated in-memory test server.

## Deletion API

- `DELETE /interviews/:id`: permanently delete one interview, preserving the job and its status history.
- `DELETE /jobs/:id`: permanently delete a job and its interviews and status events in one transaction. If any deletion fails, all changes are rolled back.

Both return `204` with no response body on success, `404` if the record does not
exist (including repeated deletion), and `400` for an invalid ID. Use the job
status `withdrawn` to retain the history of a withdrawn application instead of
deleting it.
