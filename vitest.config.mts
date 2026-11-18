import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			obsidian: path.resolve(currentDir, "tests/mocks/obsidian.ts"),
			electron: path.resolve(currentDir, "tests/mocks/electron.ts"),
		},
	},
});
