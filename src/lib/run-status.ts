type JobStatus = "PENDING" | "ANALYZING" | "SETTING_UP" | "TESTING" | "COMPLETED" | "FAILED";

export type DashboardRunStatus = "Queued" | "Running" | "Passed" | "Failed";

export function toDashboardStatus(
  status: JobStatus,
  testFailCount: number,
  bugCount: number
): DashboardRunStatus {
  if (status === "PENDING") return "Queued";
  if (status === "ANALYZING" || status === "SETTING_UP" || status === "TESTING") return "Running";
  if (status === "FAILED") return "Failed";
  if (testFailCount > 0 || bugCount > 0) return "Failed";
  return "Passed";
}

export function isActiveRun(status: JobStatus) {
  return status === "PENDING" || status === "ANALYZING" || status === "SETTING_UP" || status === "TESTING";
}
