export type BugCategory =
  | "Auth"
  | "Validation"
  | "Security"
  | "Data Leak"
  | "Performance"
  | "General";

export type BugSeverity = "Low" | "Medium" | "High" | "Critical";

function normalize(input: string | null | undefined) {
  return (input ?? "").toLowerCase();
}

export function inferBugCategory(message?: string | null, rootCause?: string | null): BugCategory {
  const text = `${normalize(message)} ${normalize(rootCause)}`;

  if (/(auth|login|token|session|oauth|permission|unauthori)/.test(text)) return "Auth";
  if (/(valid|schema|input|sanit|constraint|format|required)/.test(text)) return "Validation";
  if (/(xss|csrf|injection|sql|secure|vulnerab|exploit|rce)/.test(text)) return "Security";
  if (/(leak|expos|pii|secret|password|credential|private data)/.test(text)) return "Data Leak";
  if (/(slow|latency|timeout|memory|cpu|performance|n\+1|loop)/.test(text)) return "Performance";

  return "General";
}

export function inferBugSeverity(
  confidence: "LOW" | "MEDIUM" | "HIGH",
  message?: string | null,
  rootCause?: string | null
): BugSeverity {
  const text = `${normalize(message)} ${normalize(rootCause)}`;

  if (/(data leak|credential|rce|injection|auth bypass|critical)/.test(text)) {
    return "Critical";
  }
  if (confidence === "HIGH") return "High";
  if (confidence === "MEDIUM") return "Medium";
  return "Low";
}
