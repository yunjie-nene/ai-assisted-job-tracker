import type {
  Interview,
  InterviewInput,
  Job,
  JobDetail,
  JobInput,
  JobStatus,
  ParsedJob,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function basicCredentials(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`;
}

export function createApi(
  authorization: string | null = null,
  onUnauthorized?: () => void,
) {
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
          : AbortSignal.timeout(45_000),
        cache: "no-store",
        credentials: "omit",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error(
          "The request timed out. Refresh to check whether your change was saved before trying again.",
        );
      }
      throw new Error(
        "Unable to reach the server. Check your connection and try again.",
      );
    }
    if (response.status === 401) {
      onUnauthorized?.();
      throw new ApiError(
        "Sign in with your workspace username and password.",
        401,
      );
    }
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      const message =
        response.status === 429
          ? "Too many requests. Please wait a minute and try again."
          : typeof data?.error === "string"
            ? data.error
            : `The request failed (${response.status}). Please try again.`;
      throw new ApiError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error(
        "The API returned an unexpected response. Check the server connection.",
      );
    }
    return response.json() as Promise<T>;
  }
  return {
    jobs: (signal?: AbortSignal) =>
      request<Job[]>("/jobs", "GET", undefined, signal),
    job: (id: number, signal?: AbortSignal) =>
      request<JobDetail>(`/jobs/${id}`, "GET", undefined, signal),
    createJob: (input: JobInput) => request<Job>("/jobs", "POST", input),
    updateJob: (id: number, input: Omit<JobInput, "status">) =>
      request<Job>(`/jobs/${id}`, "PATCH", input),
    updateStatus: (id: number, status: JobStatus, notes: string) =>
      request<Job>(`/jobs/${id}/status`, "PATCH", { status, notes }),
    deleteJob: (id: number) => request<void>(`/jobs/${id}`, "DELETE"),
    interviews: (id: number, signal?: AbortSignal) =>
      request<Interview[]>(`/jobs/${id}/interviews`, "GET", undefined, signal),
    createInterview: (id: number, input: InterviewInput) =>
      request<Interview>(`/jobs/${id}/interviews`, "POST", input),
    updateInterview: (id: number, input: InterviewInput) =>
      request<Interview>(`/interviews/${id}`, "PATCH", input),
    deleteInterview: (id: number) =>
      request<void>(`/interviews/${id}`, "DELETE"),
    parse: (jd_text: string, signal: AbortSignal) =>
      request<ParsedJob>("/ai/parse-job", "POST", { jd_text }, signal),
  };
}
export type Api = ReturnType<typeof createApi>;
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
