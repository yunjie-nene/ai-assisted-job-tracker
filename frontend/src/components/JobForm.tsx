import { useEffect, useRef, useState, type FormEvent } from "react";
import { label } from "../format";
import { errorMessage, type Api } from "../api";
import { jobStatuses, type Job, type JobStatus } from "../types";
import { ErrorNotice, Icon, Spinner } from "./ui";

export function JobForm({
  api,
  job,
  onSaved,
  onCancel,
  onBusy,
}: {
  api: Api;
  job?: Job;
  onSaved: (job: Job) => void;
  onCancel: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [company, setCompany] = useState(job?.company ?? "");
  const [title, setTitle] = useState(job?.title ?? "");
  const [jd, setJd] = useState(job?.jd_text ?? "");
  const [status, setStatus] = useState<JobStatus>(job?.status ?? "saved");
  const [skills, setSkills] = useState<string[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [parseError, setParseError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const saveLock = useRef(false);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  async function parse() {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setParsing(true);
    setParseError("");
    setSkills(null);
    const timer = window.setTimeout(() => abort.abort("timeout"), 40_000);
    try {
      const result = await api.parse(jd, abort.signal);
      setCompany(result.company ?? "");
      setTitle(result.title ?? "");
      setSkills(result.skills);
    } catch (error) {
      if (!abort.signal.aborted) setParseError(errorMessage(error));
      else if (abort.signal.reason === "timeout")
        setParseError(
          "AI parsing timed out. Try again or enter the details manually.",
        );
    } finally {
      window.clearTimeout(timer);
      controller.current = null;
      setParsing(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saveLock.current || parsing) return;
    if (!company.trim() || !title.trim()) {
      setError("Enter a company and job title.");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    onBusy(true);
    setError("");
    try {
      const input = {
        company: company.trim(),
        title: title.trim(),
        jd_text: jd,
      };
      const saved = job
        ? await api.updateJob(job.id, input)
        : await api.createJob({ ...input, status });
      onSaved(saved);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      saveLock.current = false;
      setSaving(false);
      onBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="form-stack">
      <p className="muted">
        {job
          ? "Keep the details up to date as your application moves forward."
          : "Paste a job description to get a head start, or enter the details yourself."}
      </p>
      <label>
        Job description
        <textarea
          rows={6}
          maxLength={20000}
          value={jd}
          disabled={parsing || saving}
          onChange={(e) => {
            setJd(e.target.value);
            setSkills(null);
            setParseError("");
          }}
          placeholder="Paste the original job description here…"
        />
      </label>
      {!job && (
        <div className="ai-box">
          <div className="ai-intro">
            <span className="ai-icon">
              <Icon name="sparkles" />
            </span>
            <div>
              <strong>A little help from AI</strong>
              <p>Extract the company, role and key skills.</p>
            </div>
          </div>
          <button
            className="button button-ai"
            type="button"
            disabled={!jd.trim() || parsing || saving}
            onClick={() => void parse()}
          >
            {parsing ? (
              <>
                <Spinner />
                Extracting…
              </>
            ) : (
              <>
                <Icon name="sparkles" size={16} />
                Extract details
              </>
            )}
          </button>
          {parsing && (
            <p className="help" role="status">
              This can take up to 30 seconds. Your description is kept as
              entered.
            </p>
          )}
          {parseError && <ErrorNotice message={parseError} />}
          {skills !== null && (
            <div className="extracted" role="status">
              <strong>Review the extracted details below.</strong>
              <div className="tags">
                {skills.map((skill, index) => (
                  <span className="tag" key={`${skill}-${index}`}>
                    {skill}
                  </span>
                ))}
              </div>
              <p className="help">
                {skills.length
                  ? "Skills are a preview only and are not saved. The original description will be saved."
                  : "No explicit skills found. Fill in any missing details before saving."}
              </p>
            </div>
          )}
        </div>
      )}
      <div className="form-grid">
        <label>
          Company
          <input
            value={company}
            maxLength={300}
            required
            disabled={parsing || saving}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Acme"
          />
        </label>
        <label>
          Job title
          <input
            value={title}
            maxLength={300}
            required
            disabled={parsing || saving}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Full Stack Developer"
          />
        </label>
      </div>
      {!job && (
        <label>
          Initial status
          <select
            value={status}
            disabled={saving}
            onChange={(e) => setStatus(e.target.value as JobStatus)}
          >
            {jobStatuses.map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </label>
      )}
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
        <button className="button button-primary" disabled={saving || parsing}>
          {saving ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : job ? (
            "Save changes"
          ) : (
            "Save application"
          )}
        </button>
      </div>
    </form>
  );
}
