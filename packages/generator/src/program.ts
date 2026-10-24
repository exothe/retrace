import { createRequire } from "node:module";
import { Command } from "commander";
import { runCheck } from "./commands/check.ts";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** Builds the `retrace` command tree. Commands are added milestone by milestone (SPEC section 13). */
export function createProgram(): Command {
  const program = new Command()
    .name("retrace")
    .description("Turn vacation notes, photos, videos and GPS tracks into a static website.")
    .version(version);

  program
    .command("check")
    .description("Validate config and notes and print the report; writes nothing")
    .argument("<config.json>", "trip config file")
    .option("--strict", "treat warnings as errors")
    .option("--verbose", "print more details")
    .option("--no-cache", "ignore cached metadata and re-read everything")
    .action(
      async (
        configFile: string,
        options: { strict?: boolean; verbose?: boolean; cache: boolean },
      ) => {
        process.exitCode = await runCheck(configFile, options);
      },
    );

  return program;
}
