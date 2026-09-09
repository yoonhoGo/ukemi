import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Tauri serves the built app from ../dist and drives dev on a fixed port.
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "safari15", sourcemap: true },
});
