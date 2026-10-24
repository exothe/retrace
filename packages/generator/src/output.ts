/** Where commands write their output; replaced in tests. */
export interface Output {
  log(line: string): void;
  /**
   * Shows transient progress, e.g. "Reading metadata 12/80 IMG_1234.jpg". On a terminal the line
   * is overwritten in place; elsewhere progress is not shown. Cleared by the next `log`.
   */
  progress(line: string): void;
}

export function createConsoleOutput(stream: NodeJS.WriteStream = process.stdout): Output {
  let showingProgress = false;
  const clear = () => {
    if (showingProgress) stream.write("\r\x1b[2K");
    showingProgress = false;
  };
  return {
    log(line) {
      clear();
      stream.write(line + "\n");
    },
    progress(line) {
      if (!stream.isTTY) return;
      const width = stream.columns || 80;
      stream.write("\r\x1b[2K" + (line.length > width - 1 ? line.slice(0, width - 2) + "…" : line));
      showingProgress = true;
    },
  };
}

export const consoleOutput: Output = createConsoleOutput();

/** Discards everything; for tests. */
export const silentOutput: Output = { log: () => {}, progress: () => {} };
