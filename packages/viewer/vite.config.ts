import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset URLs so the site works under any base path (SPEC section 1).
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
