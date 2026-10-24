import { spawn } from "node:child_process";

export interface RunResult {
  stdout: Buffer;
  stderr: string;
}

export class ProcessError extends Error {
  readonly stderr: string;
  constructor(message: string, stderr: string) {
    super(message);
    this.name = "ProcessError";
    this.stderr = stderr;
  }
}

/**
 * Runs a command without a shell (so paths with spaces and Unicode work on every OS) and
 * collects its output. Rejects on spawn errors (e.g. ENOENT) and non-zero exit codes.
 */
export function runProcess(
  command: string,
  args: readonly string[],
  options: { onStdoutLine?: (line: string) => void } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout: Buffer[] = [];
    let stderr = "";
    let pending = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (!options.onStdoutLine) {
        stdout.push(chunk);
        return;
      }
      pending += chunk.toString("utf8");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop()!;
      for (const line of lines) options.onStdoutLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // Keep the tail only; ffmpeg can be chatty on long files.
      stderr = (stderr + chunk.toString("utf8")).slice(-8000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(stdout), stderr });
      else {
        const lastLine = stderr.trim().split(/\r?\n/).at(-1) ?? "";
        reject(new ProcessError(`${command} exited with code ${code}: ${lastLine}`, stderr));
      }
    });
  });
}
