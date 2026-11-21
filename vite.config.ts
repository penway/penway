import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: ["index.html", "projects/lism/index.html"],
    },
  },
  server: {
    port: 3000,
  },
});
