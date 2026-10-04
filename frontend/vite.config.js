import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// The dev server proxies /api -> FastAPI, so the browser never hits CORS issues.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
});
