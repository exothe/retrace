import path from "node:path";

export type Severity = "error" | "warning";

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** Absolute path of the file the diagnostic refers to */
  file?: string;
  /** 1-based line number */
  line?: number;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

export function countBySeverity(diagnostics: readonly Diagnostic[]): Record<Severity, number> {
  const counts = { error: 0, warning: 0 };
  for (const d of diagnostics) counts[d.severity]++;
  return counts;
}

/** Whether a run must fail: any error, or any warning in strict mode. */
export function isFailure(diagnostics: readonly Diagnostic[], strict: boolean): boolean {
  const { error, warning } = countBySeverity(diagnostics);
  return error > 0 || (strict && warning > 0);
}

/** Shows paths below the working directory relative to it, everything else absolute. */
export function displayPath(file: string, cwd = process.cwd()): string {
  const relative = path.relative(cwd, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}

/**
 * Formats diagnostics as `<file>:<line>: error|warning: <message>` lines (SPEC section 5.4),
 * grouped by file in order of first appearance and sorted by line within each file.
 * Diagnostics without a line come first in their group.
 */
export function formatReport(diagnostics: readonly Diagnostic[], cwd = process.cwd()): string[] {
  const groups = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const key = d.file ?? "";
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    group.push(d);
  }
  const lines: string[] = [];
  for (const [file, group] of groups) {
    // Array.prototype.sort is stable, so equal lines keep their emission order.
    group.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
    for (const d of group) {
      const location = [file ? displayPath(file, cwd) : "", d.line ?? ""].filter((p) => p !== "");
      const prefix = location.length > 0 ? `${location.join(":")}: ` : "";
      lines.push(`${prefix}${d.severity}: ${d.message}`);
    }
  }
  return lines;
}
