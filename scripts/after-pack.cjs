const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

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
