import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// This lab has ONE port (7835): the API serves the built page. There is no second dev-server port: `npm run dev -w web` rebuilds web/dist on every change
// (vite build --watch) and the running API serves it, so the browser only ever talks to one origin (same-origin writes).
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: "./src/testSetup.js", testTimeout: 30000 },
});
