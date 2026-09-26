import { useRef, useState, type FormEvent } from "react";
import { label, toLocalInput } from "../format";
import { type Api, errorMessage } from "../api";
import {
  interviewOutcomes,
  interviewStatuses,
  type Interview,
  type InterviewInput,
} from "../types";
import { ErrorNotice, Spinner } from "./ui";

export function InterviewForm({
  api,
  jobId,
  interview,
  onSaved,
  onCancel,
  onBusy,
}: {
  api: Api;
  jobId: number;
  interview?: Interview;
  onSaved: () => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [title, setTitle] = useState(interview?.title ?? "");
  const [types, setTypes] = useState(interview?.types.join(", ") ?? "");
  const [scheduled, setScheduled] = useState(
    toLocalInput(interview?.scheduled_at ?? null),
  );
  const [status, setStatus] = useState<InterviewInput["status"]>(
    interview?.status ?? "pending",
  );
  const [outcome, setOutcome] = useState<InterviewInput["outcome"]>(
    interview?.outcome ?? "pending",
  );
  const [notes, setNotes] = useState(interview?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!title.trim()) {
      setError("Enter an interview title.");
      return;
    }
    if (scheduled && Number.isNaN(new Date(scheduled).getTime())) {
      setError("Enter a valid date and time.");
      return;
    }
    lock.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      const input: InterviewInput = {
        title: title.trim(),
        types: types
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        scheduled_at: scheduled ? new Date(scheduled).toISOString() : null,
        status,
        outcome,
        notes,
      };
      if (interview) await api.updateInterview(interview.id, input);
      else await api.createInterview(jobId, input);
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      lock.current = false;
      setSaving(false);
      onBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="form-stack">
      <h3>{interview ? "Edit interview" : "New interview"}</h3>
      <label>
        Interview title
        <input
          required
          maxLength={300}
          value={title}
          disabled={saving}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Technical interview"
        />
      </label>
      <label>
        Interview types
        <input
          value={types}
          maxLength={1000}
          disabled={saving}
          onChange={(e) => setTypes(e.target.value)}
          placeholder="Technical, Live coding"
        />
        <span className="help">Separate types with commas.</span>
      </label>
      <label>
        Scheduled time
        <input
          type="datetime-local"
          value={scheduled}
          disabled={saving}
          onChange={(e) => setScheduled(e.target.value)}
        />
        <span className="help">
          Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
          Leave empty if not scheduled.
        </span>
      </label>
      <div className="form-grid">
        <label>
          Interview status
          <select
            value={status}
            disabled={saving}
            onChange={(e) =>
              setStatus(e.target.value as InterviewInput["status"])
            }
          >
            {interviewStatuses.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Outcome
          <select
            value={outcome}
            disabled={saving}
            onChange={(e) =>
              setOutcome(e.target.value as InterviewInput["outcome"])
            }
          >
            {interviewOutcomes.map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Interview notes
        <textarea
          rows={4}
          maxLength={10000}
          value={notes}
          disabled={saving}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="help">
        Interview status and outcome are independent of the application status.
      </p>
      {error && <ErrorNotice message={error} />}
      <div className="form-actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button className="button button-primary" disabled={saving}>
          {saving ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            "Save interview"
          )}
        </button>
      </div>
    </form>
  );
}
