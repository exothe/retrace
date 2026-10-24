/** Where commands write their output; replaced in tests. */
export interface Output {
  log(line: string): void;
}

export const consoleOutput: Output = {
  log: (line) => console.log(line),
};
