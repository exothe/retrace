import { createRequire } from "node:module";
import { Command } from "commander";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** Builds the `retrace` command tree. Commands are added milestone by milestone (SPEC section 13). */
export function createProgram(): Command {
  return new Command()
    .name("retrace")
    .description("Turn vacation notes, photos, videos and GPS tracks into a static website.")
    .version(version);
}
