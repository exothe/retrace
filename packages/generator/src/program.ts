import { createRequire } from "node:module";
import { Command, InvalidArgumentError } from "commander";
import { runBuild } from "./commands/build.ts";
import { runCheck } from "./commands/check.ts";
import { runIndex } from "./commands/index-command.ts";
import { DEFAULT_PORT, runPreview } from "./commands/preview.ts";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

interface CommonOptions {
  strict?: boolean;
  verbose?: boolean;
  cache: boolean;
}

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
    .action(async (configFile: string, options: CommonOptions) => {
      process.exitCode = await runCheck(configFile, options);
    });

  program
    .command("build")
    .description("Process media, write the trip folder, copy the viewer and rebuild the index")
    .argument("<config.json>", "trip config file")
    .option("--strict", "treat warnings as errors")
    .option("--verbose", "print more details")
    .option("--no-cache", "ignore the cache and reprocess everything")
    .action(async (configFile: string, options: CommonOptions) => {
      process.exitCode = await runBuild(configFile, options);
    });

  program
    .command("index")
    .description("Rebuild trips/index.json from all trips/*/trip.json in a site directory")
    .argument("<siteDir>", "site directory")
    .option("--strict", "treat warnings as errors")
    .action(async (siteDir: string, options: { strict?: boolean }) => {
      process.exitCode = await runIndex(siteDir, options);
    });

  program
    .command("preview")
    .description("Serve a site directory locally, to check it before copying it to the server")
    .argument("[siteDir]", "site directory", ".")
    .option("--port <port>", "port to listen on", (v) => parsePort(v), DEFAULT_PORT)
    .option(
      "--host [host]",
      "make the preview reachable from other devices in the network (default when given: 0.0.0.0)",
    )
    .action(async (siteDir: string, options: { port: number; host?: string | true }) => {
      const host = options.host === true ? "0.0.0.0" : options.host;
      process.exitCode = await runPreview(siteDir, {
        port: options.port,
        ...(host !== undefined && { host }),
      });
    });

  return program;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new InvalidArgumentError("must be a port number (0–65535)");
  }
  return port;
}
