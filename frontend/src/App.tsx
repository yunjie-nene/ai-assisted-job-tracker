import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { formatDate, label } from "./format";
import { basicCredentials, createApi, errorMessage } from "./api";
import { jobStatuses, type Job, type JobStatus } from "./types";
import {
  Badge,
  ErrorNotice,
  Icon,
  Loading,
  Modal,
  Spinner,
} from "./components/ui";
import { JobForm } from "./components/JobForm";
import { JobDetail } from "./components/JobDetail";

function selectedFromHash() {
  const match = window.location.hash.match(/^#job\/([1-9]\d*)$/);
  return match && Number.isSafeInteger(Number(match[1]))
    ? Number(match[1])
    : null;
}

function SignIn({
  onSignedIn,
}: {
  onSignedIn: (authorization: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const authorization = basicCredentials(username.trim(), password);
      await createApi(authorization).jobs();
      onSignedIn(authorization);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-card">
        <div className="brand-mark">
          <Icon name="briefcase" size={26} />
        </div>
        <span className="eyebrow">YOUR NEXT CHAPTER</span>
        <h1>Welcome back.</h1>
        <p className="muted">Sign in to your private job search workspace.</p>
        <form className="form-stack" onSubmit={signIn}>
          <label>
            Username
            <input
              required
              autoComplete="username"
              pattern="[^:]+"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && <ErrorNotice message={error} />}
          <button className="button button-primary" disabled={busy}>
            {busy ? <Spinner /> : null}Sign in
            <Icon name="arrow" size={17} />
          </button>
        </form>
        <p className="help">
          Your credentials stay in memory for this tab. Refreshing signs you
          out.
        </p>
      </div>
    </main>
  );
}

export default function App() {
  const [authorization, setAuthorization] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const [sort, setSort] = useState("newest");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<number | null>(selectedFromHash);
  const [modalBusy, setModalBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const unauthorized = useCallback(() => {
    setAuthorization(null);
    setNeedsLogin(true);
    setJobs([]);
    setCreating(false);
    setModalBusy(false);
  }, []);
  const api = useMemo(
    () => createApi(authorization, unauthorized),
    [authorization, unauthorized],
  );
  const refresh = useCallback(() => {
    setLoading(true);
    setError("");
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const onHashChange = () => setSelected(selectedFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    if (needsLogin) return;
    const controller = new AbortController();
    let active = true;
    api
      .jobs(controller.signal)
      .then((data) => {
        if (active) setJobs(data);
      })
      .catch((error: unknown) => {
        if (active) setError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, needsLogin, version]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const counts = Object.fromEntries(
    jobStatuses.map((status) => [
      status,
      jobs.filter((job) => job.status === status).length,
    ]),
  ) as Record<JobStatus, number>;
  const visible = jobs
    .filter(
      (job) =>
        (filter === "all" || job.status === filter) &&
        `${job.company} ${job.title}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "company"
        ? a.company.localeCompare(b.company) || b.id - a.id
        : sort === "updated"
          ? b.updated_at.localeCompare(a.updated_at) || b.id - a.id
          : b.created_at.localeCompare(a.created_at) || b.id - a.id,
    );
  function closeDetail() {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    setSelected(null);
    setModalBusy(false);
  }
  function openDetail(id: number) {
    window.location.assign(`#job/${id}`);
    setSelected(id);
  }
  function signOut() {
    unauthorized();
    closeDetail();
    setQuery("");
    setFilter("all");
    setNotice("");
  }

  if (needsLogin)
    return (
      <SignIn
        onSignedIn={(value) => {
          setLoading(true);
          setError("");
          setAuthorization(value);
          setNeedsLogin(false);
        }}
      />
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={closeDetail}>
          <span className="brand-mark">
            <Icon name="briefcase" />
          </span>
          <span>
            Next Chapter<span className="brand-sub">JOB TRACKER</span>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <a
            className="nav-item active"
            href="#"
            onClick={() => {
              setFilter("all");
              closeDetail();
            }}
            aria-current="page"
          >
            <Icon name="grid" />
            Applications<span>{jobs.length}</span>
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="small-orbit">
            <Icon name="sparkles" />
          </span>
          <h3>One step closer.</h3>
          <p>
            Every application is a new possibility. Keep your next move in
            sight.
          </p>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">ME</span>
          <div>
            <strong>My workspace</strong>
            <span>Personal job search</span>
          </div>
          {authorization && (
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={signOut}
            >
              <Icon name="logout" size={18} />
            </button>
          )}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span> <strong>Applications</strong>
          </span>
          <span className="topbar-right">
            <span className="private-dot" />
            Personal workspace
          </span>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <span className="eyebrow">MAKE YOUR NEXT MOVE</span>
              <h1>Your next chapter starts here.</h1>
              <p>
                A little structure for your big ambitions. All your
                applications, in one place.
              </p>
            </div>
            <button
              className="button button-primary new-application"
              onClick={() => setCreating(true)}
            >
              <Icon name="plus" size={18} />
              New application
            </button>
          </div>
          <section className="stats-grid" aria-label="Application overview">
            {[
              {
                title: "Total applications",
                value: jobs.length,
                hint: "Your opportunities",
                color: "neutral",
              },
              {
                title: "Applied",
                value: counts.applied,
                hint: "Out in the world",
                color: "blue",
              },
              {
                title: "Interviewing",
                value: counts.interview,
                hint: "Getting to know you",
                color: "purple",
              },
              {
                title: "Offers",
                value: counts.offer,
                hint: "Doors opening",
                color: "green",
              },
            ].map((stat) => (
              <article
                className={`stat-card stat-${stat.color}`}
                key={stat.title}
              >
                <div className="stat-label">
                  <span>{stat.title}</span>
                  <span className="stat-dot" />
                </div>
                <strong>
                  {loading && jobs.length === 0 ? "—" : stat.value}
                </strong>
                <p>{stat.hint}</p>
              </article>
            ))}
          </section>
          <section className="applications-panel" aria-label="Applications">
            <div className="panel-heading">
              <div>
                <h2>
                  Applications <span className="count">{jobs.length}</span>
                </h2>
                <p>Your progress, one opportunity at a time.</p>
              </div>
              <button
                className="text-button"
                onClick={refresh}
                disabled={loading}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <div
              className="filter-tabs"
              role="group"
              aria-label="Filter by status"
            >
              {(["all", ...jobStatuses] as const).map((status) => (
                <button
                  key={status}
                  aria-pressed={filter === status}
                  className={
                    filter === status ? "filter-tab selected" : "filter-tab"
                  }
                  onClick={() => setFilter(status)}
                >
                  {status === "all" ? "All applications" : label(status)}
                  <span>{status === "all" ? jobs.length : counts[status]}</span>
                </button>
              ))}
            </div>
            <div className="table-tools">
              <label className="search-field">
                <Icon name="search" size={18} />
                <input
                  aria-label="Search applications"
                  placeholder="Search company or role…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="sort-field">
                <span>Sort by</span>
                <select
                  aria-label="Sort applications"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">Newest added</option>
                  <option value="updated">Recently updated</option>
                  <option value="company">Company A–Z</option>
                </select>
              </label>
            </div>
            {error && (
              <div className="panel-error">
                <ErrorNotice message={error} retry={refresh} />
              </div>
            )}
            {loading && jobs.length === 0 ? (
              <Loading />
            ) : !error && jobs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Icon name="briefcase" size={30} />
                </div>
                <span className="eyebrow">A FRESH START</span>
                <h3>Your next opportunity belongs here.</h3>
                <p>
                  Add a role you have your eye on. We'll help you keep track of
                  what comes next.
                </p>
                <button
                  className="button button-primary"
                  onClick={() => setCreating(true)}
                >
                  <Icon name="plus" size={17} />
                  Add your first application
                </button>
              </div>
            ) : visible.length === 0 && !error ? (
              <div className="empty-state">
                <Icon name="search" size={28} />
                <h3>No matching applications</h3>
                <p>Try a different company, role or status.</p>
                <button
                  className="button button-secondary"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : jobs.length > 0 ? (
              <div
                className={`table-container ${loading ? "is-refreshing" : ""}`}
                aria-busy={loading}
              >
                <table>
                  <thead>
                    <tr>
                      <th>Company & role</th>
                      <th>Status</th>
                      <th>Date added</th>
                      <th>
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <button
                            className="job-link"
                            onClick={() => openDetail(job.id)}
                          >
                            <span
                              className={`company-avatar avatar-${job.id % 4}`}
                            >
                              {job.company.slice(0, 2).toUpperCase()}
                            </span>
                            <span>
                              <strong>{job.title}</strong>
                              <span>{job.company}</span>
                            </span>
                          </button>
                        </td>
                        <td>
                          <Badge status={job.status} />
                        </td>
                        <td className="date-cell">
                          {formatDate(job.created_at)}
                        </td>
                        <td>
                          <button
                            className="icon-button row-arrow"
                            aria-label={`View ${job.title} at ${job.company}`}
                            onClick={() => openDetail(job.id)}
                          >
                            <Icon name="arrow" size={19} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {jobs.length > 0 && (
              <div className="table-footer">
                <span>
                  Showing {visible.length} of {jobs.length} applications
                </span>
                <span>Small steps. Real progress.</span>
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>Built for your next chapter.</span>
            <span>AI-assisted. Always your decision.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          {notice}
        </div>
      )}
      {creating && (
        <Modal
          title="New application"
          onClose={() => setCreating(false)}
          busy={modalBusy}
        >
          <JobForm
            api={api}
            onBusy={setModalBusy}
            onCancel={() => setCreating(false)}
            onSaved={(job) => {
              setCreating(false);
              refresh();
              setNotice("Application saved.");
              openDetail(job.id);
            }}
          />
        </Modal>
      )}
      {!creating && selected !== null && (
        <Modal
          title="Application details"
          wide
          onClose={closeDetail}
          busy={modalBusy}
        >
          <JobDetail
            key={selected}
            api={api}
            id={selected}
            onBusy={setModalBusy}
            onChanged={refresh}
            onDeleted={() => {
              closeDetail();
              refresh();
              setNotice("Application deleted.");
            }}
          />
        </Modal>
      )}
    </div>
  );
}
