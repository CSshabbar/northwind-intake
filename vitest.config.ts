import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { defineConfig } from "vitest/config";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "northwind-intake-"));

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_PATH: path.join(dir, "test.sqlite"),
    },
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
