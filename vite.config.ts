import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    lib: {
      entry: {
        authoring: resolve(root, "src/authoring.ts"),
        craft: resolve(root, "src/craft.ts"),
        index: resolve(root, "src/index.ts"),
        resources: resolve(root, "src/resources.ts"),
        "resource-browser": resolve(root, "src/resource-browser.ts"),
        services: resolve(root, "src/services.ts"),
        webgal: resolve(root, "src/webgal.ts"),
        workspace: resolve(root, "src/workspace.ts"),
      },
      fileName: (_format, entry) => `${entry}.js`,
      formats: ["es"],
    },
    rollupOptions: {
      external: (id) =>
        id === "@haneoka/altair-ui-react" ||
        id === "@haneoka/vega-plugin-webgal/commands" ||
        /^react(?:-dom)?(?:\/|$)/u.test(id) ||
        id === "@haneoka/altair/documents" ||
        id === "@haneoka/altair-plugin-adv/documents" ||
        id === "@haneoka/altair/model" ||
        id === "@haneoka/altair/plugins" ||
        id === "@haneoka/altair-plugin-adv/commands" ||
        id === "@haneoka/vega-protocol",
    },
    sourcemap: true,
    target: "es2022",
  },
});
