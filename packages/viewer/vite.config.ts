import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
};

/**
 * Dev only: serves `trips/` from a generated site directory (RETRACE_SITE, default
 * examples/site), with range requests so video seeking works.
 */
function serveTrips(): Plugin {
  const siteDir = path.resolve(
    process.env.RETRACE_SITE ?? path.join(import.meta.dirname, "../../examples/site"),
  );
  const tripsDir = path.join(siteDir, "trips");
  return {
    name: "retrace-serve-trips",
    configureServer(server) {
      server.middlewares.use("/trips", (req, res, next) => {
        const relative = decodeURIComponent((req.url ?? "/").split("?")[0]!);
        const file = path.join(tripsDir, relative);
        if (!file.startsWith(tripsDir + path.sep)) return next();
        let size: number;
        try {
          const info = statSync(file);
          if (!info.isFile()) return next();
          size = info.size;
        } catch {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader(
          "Content-Type",
          CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
        );
        res.setHeader("Accept-Ranges", "bytes");
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
        if (range && (range[1] || range[2])) {
          const start = range[1] ? Number(range[1]) : size - Number(range[2]);
          const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          res.statusCode = 206;
          res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
          res.setHeader("Content-Length", end - start + 1);
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader("Content-Length", size);
          createReadStream(file).pipe(res);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveTrips()],
  // Relative asset URLs so the site works under any base path (SPEC section 1).
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
