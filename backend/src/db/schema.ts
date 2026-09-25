export const schema = `
  CREATE TABLE IF NOT EXISTS Jobs (
    id INTEGER PRIMARY KEY,
    company TEXT NOT NULL CHECK (length(trim(company)) > 0),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    jd_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'saved'
      CHECK (
        status IN (
          'saved', 'applied', 'interview',
          'offer', 'rejected', 'withdrawn'
        )
      ),
    created_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS Job_Events (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES Jobs(id),
    status TEXT NOT NULL
      CHECK (
        status IN (
          'saved', 'applied', 'interview',
          'offer', 'rejected', 'withdrawn'
        )
      ),
    occurred_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS Interviews (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES Jobs(id),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    types TEXT NOT NULL DEFAULT '[]'
      CHECK (
        CASE WHEN json_valid(types)
          THEN json_type(types) = 'array'
          ELSE 0
        END
      ),
    scheduled_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (
        status IN ('pending', 'scheduled', 'completed', 'cancelled')
      ),
    outcome TEXT NOT NULL DEFAULT 'pending'
      CHECK (outcome IN ('pending', 'passed', 'failed')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL
      DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_jobs_status
    ON Jobs(status);

  CREATE INDEX IF NOT EXISTS idx_job_events_timeline
    ON Job_Events(job_id, occurred_at, id);

  CREATE INDEX IF NOT EXISTS idx_interviews_job_schedule
    ON Interviews(job_id, scheduled_at, id);
`;
