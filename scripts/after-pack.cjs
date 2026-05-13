const { cpSync, existsSync, mkdirSync, readdirSync, rmSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { spawnSync } = require("node:child_process");

const BUNDLED_RUNTIME_PACKAGES = [
  "@borewit/text-codec",
  "@clack/core",
  "@clack/prompts",
  "@mariozechner/jiti",
  "@mariozechner/pi-agent-core",
  "@mariozechner/pi-ai",
  "@mariozechner/pi-coding-agent",
  "@mariozechner/pi-tui",
  "@modelcontextprotocol/sdk",
  "@tokenizer/inflate",
  "ajv-formats",
  "ansi-styles",
  "balanced-match",
  "brace-expansion",
  "buffer-crc32",
  "chalk",
  "cli-highlight",
  "cross-spawn",
  "debug",
  "define-data-property",
  "define-properties",
  "diff",
  "end-of-stream",
  "entities",
  "es-define-property",
  "es-errors",
  "escape-string-regexp",
  "eventsource",
  "eventsource-parser",
  "extract-zip",
  "fast-deep-equal",
  "fast-string-truncated-width",
  "fast-string-width",
  "fast-uri",
  "fast-wrap-ansi",
  "fd-slicer",
  "get-east-asian-width",
  "get-stream",
  "globalthis",
  "gopd",
  "graceful-fs",
  "has-flag",
  "has-property-descriptors",
  "highlight.js",
  "ieee754",
  "ignore",
  "isexe",
  "jiti",
  "json5",
  "linkify-it",
  "markdown-it",
  "marked",
  "mdurl",
  "minimatch",
  "ms",
  "object-keys",
  "once",
  "openai",
  "pako",
  "parse5",
  "parse5-htmlparser2-tree-adapter",
  "partial-json",
  "path-key",
  "pend",
  "pkce-challenge",
  "proper-lockfile",
  "pump",
  "punycode.js",
  "qrcode-terminal",
  "retry",
  "setimmediate",
  "shebang-command",
  "shebang-regex",
  "signal-exit",
  "sisteransi",
  "strtok3",
  "token-types",
  "tslog",
  "typebox",
  "uc.micro",
  "undici",
  "uint8array-extras",
  "uuid",
  "which",
  "wrappy",
  "ws",
  "yaml",
  "yauzl",
  "zod-to-json-schema"
];

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  copyBundledRuntimePackages(context);
  prunePackagedOpenClawDocs(context.appOutDir);

  const exePath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const iconPath = join(context.packager.projectDir, "assets", "icons", "app-icon.ico");
  const rceditPath = findRcedit(context.packager.projectDir);

  if (!existsSync(exePath)) {
    throw new Error(`Packaged executable not found: ${exePath}`);
  }
  if (!existsSync(iconPath)) {
    throw new Error(`Icon not found: ${iconPath}`);
  }
  if (!rceditPath) {
    throw new Error("rcedit-x64.exe not found. Run npm install before packaging.");
  }

  const result = spawnSync(rceditPath, [exePath, "--set-icon", iconPath], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`rcedit failed with exit code ${result.status}`);
  }
};

module.exports.prunePackagedOpenClawDocs = prunePackagedOpenClawDocs;

function copyBundledRuntimePackages(context) {
  const sourceNodeModules = join(context.packager.projectDir, "node_modules");
  const targetNodeModules = join(context.appOutDir, "resources", "app.asar.unpacked", "node_modules");
  for (const packageName of BUNDLED_RUNTIME_PACKAGES) {
    const source = packagePath(sourceNodeModules, packageName);
    const target = packagePath(targetNodeModules, packageName);
    if (!existsSync(source)) {
      throw new Error(`Runtime package not found: ${packageName}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true, force: true, dereference: false });
  }
}

function prunePackagedOpenClawDocs(appOutDir) {
  const openClawRoot = join(appOutDir, "resources", "app.asar.unpacked", "node_modules", "openclaw");
  const docsRoot = join(openClawRoot, "docs");
  const removable = [
    join(openClawRoot, "CHANGELOG.md"),
    join(openClawRoot, "README.md")
  ];

  if (existsSync(docsRoot)) {
    for (const entry of readdirSync(docsRoot, { withFileTypes: true })) {
      if (entry.name === "reference") {
        pruneOpenClawReferenceDocs(join(docsRoot, entry.name));
        continue;
      }
      rmSync(join(docsRoot, entry.name), { recursive: true, force: true });
    }
  }

  for (const target of removable) {
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
    }
  }
}

function pruneOpenClawReferenceDocs(referenceDir) {
  if (!existsSync(referenceDir)) {
    return;
  }
  for (const entry of readdirSync(referenceDir, { withFileTypes: true })) {
    if (entry.name === "templates") {
      continue;
    }
    rmSync(join(referenceDir, entry.name), { recursive: true, force: true });
  }
}

function packagePath(nodeModulesDir, packageName) {
  return join(nodeModulesDir, ...packageName.split("/"));
}

function findRcedit(projectDir) {
  const localRcedit = join(projectDir, "node_modules", "rcedit", "bin", "rcedit-x64.exe");
  if (existsSync(localRcedit)) {
    return localRcedit;
  }

  const cacheRoot = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "electron-builder", "Cache", "winCodeSign")
    : undefined;
  if (!cacheRoot || !existsSync(cacheRoot)) {
    return undefined;
  }

  return findFirst(cacheRoot, "rcedit-x64.exe");
}

function findFirst(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isFile() && entry.name === fileName) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findFirst(fullPath, fileName);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}
