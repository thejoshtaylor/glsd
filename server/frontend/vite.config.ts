// GLSD - Vite Configuration
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import pkg from "./package.json";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Stub @tauri-apps/* packages — not installed in the web frontend.
      // Tests mock these via vi.mock() in setup.ts; the alias allows Vite to
      // resolve the import path before the mock intercepts at runtime.
      "@tauri-apps/api/core": path.resolve(__dirname, "./src/test/__mocks__/tauri-stubs.ts"),
      "@tauri-apps/api/event": path.resolve(__dirname, "./src/test/__mocks__/tauri-stubs.ts"),
      "@tauri-apps/api/window": path.resolve(__dirname, "./src/test/__mocks__/tauri-stubs.ts"),
      "@tauri-apps/plugin-shell": path.resolve(__dirname, "./src/test/__mocks__/tauri-stubs.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "./src/test/__mocks__/tauri-stubs.ts"),
      "@tauri-apps/plugin-fs": path.resolve(__dirname, "./src/test/__mocks__/tauri-stubs.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': {
        target: 'http://localhost:8000',
        ws: true,
      },
    },
  },
  envPrefix: ["VITE_"],
  build: {
    target: "es2022",
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-charts': ['recharts'],
          'vendor-flow': ['@xyflow/react'],
          'vendor-terminal': [
            '@xterm/xterm',
            '@xterm/addon-fit',
            '@xterm/addon-search',
            '@xterm/addon-serialize',
            '@xterm/addon-web-links',
          ],
          'vendor-markdown': [
            'react-markdown',
            'remark-gfm',
            'rehype-highlight',
          ],
          'vendor-dnd': [
            '@dnd-kit/core',
            '@dnd-kit/sortable',
            '@dnd-kit/utilities',
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
