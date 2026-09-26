# AI-Assisted Job Tracker

A personal job application tracker with AI-assisted job description parsing.
Built with React, TypeScript, Express, and SQLite, with automated deployment
to Vercel and AWS EC2.

## Live Application

[Open Next Chapter](https://ai-assisted-job-tracker.vercel.app/)

The deployed application is a private, single-user workspace that requires
owner credentials. Public registration and multi-user data isolation are
not implemented.

## Features

- Create, edit, search, filter, sort, and delete job applications.
- Track application statuses and status history.
- Manage interview rounds, schedules, outcomes, and notes.
- Extract company, role, and skills from job descriptions using Gemini.
- Review AI suggestions before saving an application.
- Responsive interface for desktop and mobile.

Extracted skills are currently preview-only. Interview updates do not
automatically change the application status.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, TypeScript, Express |
| Database | SQLite |
| AI | Google Gemini |
| Hosting | Vercel, AWS EC2 |
| Server | Ubuntu, Nginx, systemd, Let's Encrypt |
| Testing | Playwright, Python unittest |
| CI/CD | GitHub Actions, AWS OIDC, AWS Systems Manager |
| Backups | Amazon S3, systemd timer |

## Architecture

The browser sends same-origin `/api` requests to Vercel. Vercel forwards
them over HTTPS to Nginx on EC2, which authenticates requests and proxies
them to the Express API.

SQLite data is stored separately from code releases. Gemini API keys
remain on the backend.

Production access uses Nginx HTTP Basic Authentication with a custom
frontend login page. Credentials stay in page memory; refreshing
requires signing in again.

## CI/CD

- Pull requests run frontend, backend, and deployment script checks.
- Vercel creates branch previews and deploys production updates from `main`.
- Backend deployments run after backend checks pass on `main`.
- GitHub authenticates to AWS using OIDC temporary credentials.
- AWS Systems Manager runs deployment commands on EC2.
- Deployments back up SQLite, switch releases, and check API health.
- Failed activation attempts restore the previous code release.

Frontend and backend deployments run independently. Backend release
switching briefly interrupts the API. Database contents are not
automatically rolled back.

Currently, every update to `main` triggers the backend workflow,
including documentation changes. Server configuration and system
dependencies are maintained separately from application deployments.

## Database Backups

A systemd timer creates a daily SQLite snapshot and uploads it to a
private S3 bucket using the EC2 instance role.

- SQLite's backup API captures committed data, including WAL changes.
- Each snapshot passes an integrity check before upload.
- Uploads use SSE-S3 encryption and a SHA-256 checksum.
- An S3 lifecycle rule expires backups after 30 days.
- Failed uploads retain the local snapshot for investigation.

The first production backup was downloaded and verified for integrity,
checksum consistency, and stored records.

This is daily snapshot protection, not continuous point-in-time recovery.
The backup task is installed separately on EC2; its installer is not
currently included in this repository.

## Run Locally

Use Node.js 24. Install dependencies from the repository root:

```bash
nvm use
npm ci --prefix backend
npm ci --prefix frontend
```

Start the backend:

```bash
npm run dev --prefix backend
```

In a second terminal, start the frontend:

```bash
npm run dev --prefix frontend
```

Open [localhost:5173](http://localhost:5173).

Vite forwards API requests to `http://localhost:3000`. Local development
does not use the production Nginx login.

Configure `GEMINI_API_KEY` in `backend/.env` to enable AI extraction.
Manual application management works without it. Never commit API keys
or place them in frontend environment variables.

## Testing

The project includes automated tests for:

- Backend API validation, persistence, status history, and interviews.
- Frontend application workflows.
- Deployment configuration and release recovery.

See the frontend and deployment documentation for test commands.
Production login, application creation, data persistence, and S3 backup
readback have also been checked manually.

## Documentation

- [Frontend development and testing](frontend/README.md)
- [Deployment and database backups](docs/DEPLOYMENT.md)
- [Backend CD and release recovery](docs/BACKEND_CD.md)

## Project Structure

```text
backend/             Express API, SQLite, and API tests
frontend/            React application and browser tests
deploy/              Server configuration, deployment scripts, and tests
docs/                Deployment and maintenance guides
.github/workflows/   Frontend CI and backend CI/CD
```
