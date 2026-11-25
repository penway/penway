import { defineConfig } from "vite";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import selection from "./projects/lism/gallery/selection.json";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "lism-page-paths",
      enforce: "post",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = new URL(req.url || "/", "http://localhost");
          if (url.pathname === "/lism" || url.pathname === "/lism/gallery" || url.pathname === "/lism/paper") {
            res.writeHead(308, { Location: url.pathname + "/" + url.search }).end();
            return;
          }
          if (url.pathname.startsWith("/lism/")) req.url = "/projects" + url.pathname + url.search;
          next();
        });
      },
      generateBundle: {
        order: "post",
        handler(_, bundle) {
          for (const page of ["lism/index.html", "lism/gallery/index.html", "lism/paper/index.html"]) {
            const source = "projects/" + page;
            const html = bundle[source];
            if (html?.type !== "asset") this.error("Missing LiSM page: " + source);
            this.emitFile({ type: "asset", fileName: page, source: html.source });
            delete bundle[source];
          }
        },
      },
    },
    {
      name: "lism-gallery-catalog",
      writeBundle(options) {
        const source = resolve("public");
        const dest = resolve(options.dir || "dist");
        const pools = new Set(selection.map(s => "projects/lism/" + s.task));
        cpSync(source, dest, {
          recursive: true,
          filter: path => !pools.has(relative(source, path).split("\\").join("/")),
        });
        const assets = new Set<string>();
        for (const sample of selection) {
          const folder = "projects/lism/" + sample.task + "/";
          assets.add(folder + sample.file);
          if (sample.task === "foreground" || sample.task === "keypoints") {
            assets.add(folder + sample.request + ".svg");
          }
        }
        for (const asset of assets) {
          mkdirSync(dirname(join(dest, asset)), { recursive: true });
          cpSync(join(source, asset), join(dest, asset));
        }
      },
    },
  ],
  build: {
    copyPublicDir: false,
    rolldownOptions: {
      input: ["index.html", "projects/lism/index.html", "projects/lism/gallery/index.html", "projects/lism/paper/index.html"],
    },
  },
  server: {
    port: 3000,
  },
});
