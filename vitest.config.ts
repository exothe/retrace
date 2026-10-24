import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "shared",
          root: "packages/shared",
          include: ["src/**/*.test.ts"],
          typecheck: { enabled: true, include: ["src/**/*.test-d.ts"] },
        },
      },
      {
        test: { name: "generator", root: "packages/generator", include: ["src/**/*.test.ts"] },
      },
      {
        test: { name: "viewer", root: "packages/viewer", include: ["src/**/*.test.{ts,tsx}"] },
      },
    ],
  },
});
