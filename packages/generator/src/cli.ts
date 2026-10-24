#!/usr/bin/env node
import { ExitCode } from "./exit-codes.ts";
import { createProgram } from "./program.ts";

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = ExitCode.RuntimeError;
}
