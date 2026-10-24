import type { NetworkInterfaceInfo } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ExitCode } from "../exit-codes.ts";
import { useTempDir } from "../test/temp-dir.ts";
import { previewUrls, runPreview, startPreview } from "./preview.ts";

const tempDir = useTempDir();
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function site() {
  const temp = await tempDir();
  await temp.write("index.html", "<!doctype html><title>Retrace</title>");
  await temp.write("trips/index.json", '{"schemaVersion":1}');
  await temp.write(
    "trips/t/media/v.mp4",
    Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256)),
  );
  const { server, port } = await startPreview(temp.dir, { port: 0 });
  servers.push(server);
  return `http://localhost:${port}`;
}

describe("startPreview", () => {
  it("serves the site with content types", async () => {
    const base = await site();
    const index = await fetch(`${base}/`);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain("Retrace");
    const json = await fetch(`${base}/trips/index.json`);
    expect(json.headers.get("content-type")).toMatch(/application\/json/);
    expect((await fetch(`${base}/trips/nope.json`)).status).toBe(404);
  });

  it("answers range requests, which video seeking needs", async () => {
    const base = await site();
    const response = await fetch(`${base}/trips/t/media/v.mp4`, {
      headers: { Range: "bytes=100-199" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(response.headers.get("content-type")).toBe("video/mp4");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBe(100);
    expect(bytes[0]).toBe(100);
  });
});

describe("runPreview", () => {
  it("refuses a folder without index.html", async () => {
    const { dir } = await tempDir();
    const lines: string[] = [];
    const code = await runPreview(
      path.join(dir),
      { port: 0 },
      { log: (l) => lines.push(l), progress: () => {} },
    );
    expect(code).toBe(ExitCode.ValidationError);
    expect(lines[0]).toMatch(/has no index\.html/);
  });

  it("reports a port that is in use", async () => {
    const temp = await tempDir();
    await temp.write("index.html", "x");
    const { server, port } = await startPreview(temp.dir, { port: 0 });
    servers.push(server);
    const lines: string[] = [];
    const code = await runPreview(
      temp.dir,
      { port },
      { log: (l) => lines.push(l), progress: () => {} },
    );
    expect(code).toBe(ExitCode.RuntimeError);
    expect(lines[0]).toBe(`error: port ${port} is already in use; choose another with --port`);
  });
});

describe("previewUrls", () => {
  const interfaces = {
    lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    en0: [
      { address: "192.168.178.95", family: "IPv4", internal: false },
      { address: "fe80::1", family: "IPv6", internal: false },
    ],
  } as unknown as NodeJS.Dict<NetworkInterfaceInfo[]>;

  it("lists localhost only by default", () => {
    expect(previewUrls(undefined, 4173, interfaces)).toEqual(["http://localhost:4173/"]);
  });

  it("adds network addresses when listening on all interfaces", () => {
    expect(previewUrls("0.0.0.0", 4173, interfaces)).toEqual([
      "http://localhost:4173/",
      "http://192.168.178.95:4173/",
    ]);
  });

  it("shows a specific host as given", () => {
    expect(previewUrls("192.168.178.95", 8080, interfaces)).toEqual([
      "http://192.168.178.95:8080/",
    ]);
  });
});
