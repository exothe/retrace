import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import { stat } from "node:fs/promises";
import path from "node:path";
import sirv from "sirv";
import { displayPath } from "../diagnostics.ts";
import { ExitCode } from "../exit-codes.ts";
import { consoleOutput } from "../output.ts";
import type { Output } from "../output.ts";

export const DEFAULT_PORT = 4173;

export interface PreviewOptions {
  port?: number;
  /** Interface to listen on; "0.0.0.0" for the whole network. Default: localhost only. */
  host?: string;
}

/**
 * Serves a site directory as static files (SPEC section 4). sirv answers range requests, which
 * video seeking needs (and Safari needs to play videos at all). Caching is off, so a rebuild
 * shows up on reload.
 */
export async function startPreview(
  siteDir: string,
  options: PreviewOptions = {},
): Promise<{ server: Server; port: number }> {
  const handler = sirv(siteDir, { dev: true, etag: true, dotfiles: false });
  const server = createServer((req, res) =>
    handler(req, res, () => {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
    }),
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? DEFAULT_PORT, options.host ?? "localhost", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return { server, port: (server.address() as AddressInfo).port };
}

/** `retrace preview [siteDir]`: serves the site until interrupted. */
export async function runPreview(
  siteDir: string,
  options: PreviewOptions = {},
  out: Output = consoleOutput,
): Promise<ExitCode> {
  const dir = path.resolve(siteDir);
  const index = await stat(path.join(dir, "index.html")).catch(() => undefined);
  if (!index?.isFile()) {
    out.log(
      `error: ${displayPath(dir)} has no index.html. Pass the site directory (the "output" of ` +
        "a trip config), and build a trip into it first with: retrace build <config.json>",
    );
    return ExitCode.ValidationError;
  }

  let port: number;
  try {
    ({ port } = await startPreview(dir, options));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const wanted = options.port ?? DEFAULT_PORT;
    out.log(
      code === "EADDRINUSE"
        ? `error: port ${wanted} is already in use; choose another with --port`
        : `error: cannot start the server: ${(error as Error).message}`,
    );
    return ExitCode.RuntimeError;
  }

  out.log(`Serving ${displayPath(dir)}`);
  for (const url of previewUrls(options.host, port)) out.log(`  ${url}`);
  out.log("Press Ctrl+C to stop.");
  // Keep running until the process is interrupted.
  return new Promise<ExitCode>(() => {});
}

/** URLs to print: localhost, plus every network address when listening on all interfaces. */
export function previewUrls(
  host: string | undefined,
  port: number,
  interfaces = os.networkInterfaces(),
): string[] {
  if (host && host !== "0.0.0.0" && host !== "::") return [`http://${formatHost(host)}:${port}/`];
  const urls = [`http://localhost:${port}/`];
  if (host) {
    for (const addresses of Object.values(interfaces)) {
      for (const a of addresses ?? []) {
        if (!a.internal && a.family === "IPv4") urls.push(`http://${a.address}:${port}/`);
      }
    }
  }
  return urls;
}

function formatHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}
