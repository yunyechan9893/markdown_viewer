import { defineConfig } from "vite";

// Tauri가 띄우는 개발 서버 포트와 맞춘다.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "chrome105", outDir: "dist" },
});
