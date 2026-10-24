/** Process exit codes (SPEC section 4). */
export const ExitCode = {
  Success: 0,
  ValidationError: 1,
  RuntimeError: 2,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
