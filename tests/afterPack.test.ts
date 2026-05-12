import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { prunePackagedOpenClawDocs } = require("../scripts/after-pack.cjs");

describe("prunePackagedOpenClawDocs", () => {
  it("removes OpenClaw documentation weight without touching runtime files", async () => {
    const appOutDir = mkdtempSync(join(tmpdir(), "hajimi-pack-"));
    const openClawRoot = join(appOutDir, "resources", "app.asar.unpacked", "node_modules", "openclaw");
    await mkdir(join(openClawRoot, "docs"), { recursive: true });
    await mkdir(join(openClawRoot, "dist"), { recursive: true });
    await writeFile(join(openClawRoot, "docs", "guide.md"), "docs", "utf8");
    await writeFile(join(openClawRoot, "CHANGELOG.md"), "changes", "utf8");
    await writeFile(join(openClawRoot, "README.md"), "readme", "utf8");
    await writeFile(join(openClawRoot, "openclaw.mjs"), "runtime", "utf8");
    await writeFile(join(openClawRoot, "dist", "index.js"), "dist", "utf8");

    prunePackagedOpenClawDocs(appOutDir);

    await expect(readFile(join(openClawRoot, "openclaw.mjs"), "utf8")).resolves.toBe("runtime");
    await expect(readFile(join(openClawRoot, "dist", "index.js"), "utf8")).resolves.toBe("dist");
    await expect(readFile(join(openClawRoot, "docs", "guide.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(openClawRoot, "CHANGELOG.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(openClawRoot, "README.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
