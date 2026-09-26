# AI-Assisted Job Tracker

A personal job application tracker with a React frontend, an Express API,
and AI-assisted job description parsing.

## Features

- Create, edit, search, filter, and delete job applications.
- Track application statuses and their history.
- Manage interview rounds, schedules, outcomes, and notes.
- Extract company, role, and skills from job descriptions using Gemini.
- Review AI suggestions before saving an application.
- Use the workspace on desktop and mobile.

Extracted skills are currently a preview only and are not saved separately.
Interview updates do not automatically change the application status.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, TypeScript, Express |
| Database | SQLite |
| AI | Google Gemini |
| Testing | Playwright |
| CI | GitHub Actions |
| Planned deployment | Vercel, AWS EC2, Nginx |

## Run Locally

Use Node.js 24. From the repository root, install dependencies:

```bash
nvm use
npm ci --prefix backend
npm ci --prefix frontend
```

Start the backend in one terminal:

```bash
cd backend
npm run dev
```

Start the frontend in another terminal, from the repository root:

```bash
cd frontend
npm run dev
```

Open http://localhost:5173. The frontend forwards API requests to
http://localhost:3000.

Configure `GEMINI_API_KEY` in `backend/.env` to enable AI extraction.
Manual application management works without it. Keep API keys on the backend.

## Project Structure

```text
backend/             Express API, SQLite database code, and API tests
frontend/            React application and browser tests
deploy/              Server and reverse-proxy configuration
docs/                Deployment documentation
.github/workflows/   Backend and frontend CI
```

## Documentation

- [Frontend development and testing](frontend/README.md)
- [Deployment guide](docs/DEPLOYMENT.md)

## Status

The frontend and backend MVP are implemented and locally tested.
Deployment configuration is prepared; public deployment is pending.