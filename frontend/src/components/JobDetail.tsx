import { useEffect, useRef, useState } from "react";
import { formatDate, label } from "../format";
import { errorMessage, type Api } from "../api";
import {
  jobStatuses,
  type Interview,
  type JobDetail as JobData,
  type JobStatus,
} from "../types";
import { Badge, ErrorNotice, Icon, Loading, Spinner } from "./ui";
import { JobForm } from "./JobForm";
import { InterviewForm } from "./InterviewForm";

export function JobDetail({
  api,
  id,
  onChanged,
  onDeleted,
  onBusy,
}: {
  api: Api;
  id: number;
  onChanged: () => void;
  onDeleted: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [job, setJob] = useState<JobData | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [interviewEditor, setInterviewEditor] = useState<
    Interview | "new" | null
  >(null);
  const [deleting, setDeleting] = useState<"job" | Interview | null>(null);
  const [nextStatus, setNextStatus] = useState<JobStatus>("saved");
  const [notes, setNotes] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.all([
      api.job(id, controller.signal),
      api.interviews(id, controller.signal),
    ])
      .then(([detail, rounds]) => {
        if (!active) return;
        setJob(detail);
        setInterviews(rounds);
        setNextStatus(detail.status);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, id, version]);

  function changed() {
    setLoading(true);
    setLoadError("");
    setVersion((v) => v + 1);
    onChanged();
  }
  async function mutate(action: () => Promise<unknown>, after: () => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      await action();
      after();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  if (loading) return <Loading text="Loading application…" />;
  if (loadError)
    return (
      <ErrorNotice
        message={loadError}
        retry={() => {
          setLoading(true);
          setLoadError("");
          setVersion((v) => v + 1);
        }}
      />
    );
  if (!job) return null;
  if (editing)
    return (
      <JobForm
        api={api}
        job={job}
        onBusy={onBusy}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          changed();
        }}
      />
    );
  if (interviewEditor)
    return (
      <InterviewForm
        api={api}
        jobId={id}
        interview={interviewEditor === "new" ? undefined : interviewEditor}
        onBusy={onBusy}
        onCancel={() => setInterviewEditor(null)}
        onSaved={() => {
          setInterviewEditor(null);
          changed();
        }}
      />
    );

  if (deleting)
    return (
      <div className="form-stack">
        <div className="delete-symbol">!</div>
        <h3>
          {deleting === "job"
            ? "Delete this application?"
            : "Delete this interview?"}
        </h3>
        <p className="muted">
          {deleting === "job"
            ? `${job.title} at ${job.company} and all its interviews and status history will be permanently deleted. To keep the history, change its status to Withdrawn instead.`
            : `${deleting.title} will be permanently deleted. The application and its history will be kept.`}
        </p>
        <p>This cannot be undone.</p>
        {error && <ErrorNotice message={error} />}
        <div className="form-actions">
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => {
              setDeleting(null);
              setError("");
            }}
          >
            Cancel
          </button>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={() =>
              void mutate(
                () =>
                  deleting === "job"
                    ? api.deleteJob(id)
                    : api.deleteInterview(deleting.id),
                () => {
                  if (deleting === "job") onDeleted();
                  else {
                    setDeleting(null);
                    changed();
                  }
                },
              )
            }
          >
            {busy ? <Spinner /> : null}Delete permanently
          </button>
        </div>
      </div>
    );

  return (
    <div className="detail">
      <div className="detail-title">
        <div className="company-avatar">
          {job.company.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <span className="eyebrow">{job.company}</span>
          <h3>{job.title}</h3>
        </div>
        <Badge status={job.status} />
      </div>
      <div className="detail-meta">
        <span>Added {formatDate(job.created_at)}</span>
        <button
          className="text-button"
          onClick={() => setEditing(true)}
          disabled={busy}
        >
          Edit application
        </button>
      </div>
      <section className="detail-section">
        <h3>Move things forward</h3>
        <p className="help">Every status change is saved to your timeline.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutate(
              () => api.updateStatus(id, nextStatus, notes),
              () => {
                setNotes("");
                changed();
              },
            );
          }}
          className="form-stack compact"
        >
          <div className="status-controls">
            <label>
              Application status
              <select
                value={nextStatus}
                disabled={busy}
                onChange={(e) => setNextStatus(e.target.value as JobStatus)}
              >
                {jobStatuses.map((v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-primary"
              disabled={busy || nextStatus === job.status}
            >
              {busy ? <Spinner /> : <Icon name="check" size={16} />}Update
              status
            </button>
          </div>
          <label>
            Status note <span className="optional">(optional)</span>
            <input
              maxLength={3000}
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Application submitted through the company website"
            />
          </label>
        </form>
        {error && <ErrorNotice message={error} />}
      </section>
      <section className="detail-section">
        <div className="section-heading">
          <h3>
            Interviews <span className="count">{interviews.length}</span>
          </h3>
          <button
            className="button button-small button-secondary"
            disabled={busy}
            onClick={() => setInterviewEditor("new")}
          >
            <Icon name="plus" size={16} />
            Add interview
          </button>
        </div>
        {interviews.length === 0 ? (
          <p className="section-empty">
            No interviews yet. Add your first conversation when you're ready.
          </p>
        ) : (
          <div className="interview-list">
            {interviews.map((interview) => (
              <article className="interview-card" key={interview.id}>
                <div className="section-heading">
                  <h4>{interview.title}</h4>
                  <span className="tag">{label(interview.status)}</span>
                </div>
                <p className="interview-time">
                  {interview.scheduled_at
                    ? formatDate(interview.scheduled_at, true)
                    : "Time not scheduled"}
                </p>
                <div className="tags">
                  {interview.types.map((type, i) => (
                    <span key={`${type}-${i}`} className="tag">
                      {type}
                    </span>
                  ))}
                  <span className={`outcome outcome-${interview.outcome}`}>
                    Outcome: {label(interview.outcome)}
                  </span>
                </div>
                {interview.notes && (
                  <p className="preserve-text interview-notes">
                    {interview.notes}
                  </p>
                )}
                <div className="inline-actions">
                  <button
                    className="text-button"
                    disabled={busy}
                    aria-label={`Edit ${interview.title}`}
                    onClick={() => setInterviewEditor(interview)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-button danger-text"
                    disabled={busy}
                    aria-label={`Delete ${interview.title}`}
                    onClick={() => {
                      setError("");
                      setDeleting(interview);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="detail-section">
        <h3>Activity timeline</h3>
        <ol className="timeline">
          {[...job.events].reverse().map((event) => (
            <li key={event.id}>
              <span className={`timeline-dot dot-${event.status}`} />
              <div>
                <strong>{label(event.status)}</strong>
                <time dateTime={event.occurred_at}>
                  {formatDate(event.occurred_at, true)}
                </time>
                {event.notes && <p className="preserve-text">{event.notes}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="detail-section">
        <details>
          <summary>Original job description</summary>
          <p className="preserve-text job-description">
            {job.jd_text || "No description added."}
          </p>
        </details>
      </section>
      <div className="detail-footer">
        <span className="help">Updated {formatDate(job.updated_at)}</span>
        <button
          className="text-button danger-text"
          disabled={busy}
          onClick={() => {
            setError("");
            setDeleting("job");
          }}
        >
          Delete application
        </button>
      </div>
    </div>
  );
}
