import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import JSZip from "jszip";
import { imageSize } from "image-size";
import type {
  ImportedPetBundle,
  PetImportErrorCode,
  PetImportErrorDetails,
  PetManifest
} from "./types.js";
import { normalizeAnimationFrameCounts } from "../src/lib/atlas.js";

const PET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,47}$/i;
const PET_JSON = "pet.json";
const SPRITESHEET = "spritesheet.webp";

interface BundleFiles {
  manifestBuffer: Buffer;
  spritesheetBuffer: Buffer;
}

export class PetImportError extends Error implements PetImportErrorDetails {
  code: PetImportErrorCode;
  petId?: string;
  path?: string;

  constructor(details: PetImportErrorDetails) {
    super(details.message);
    this.name = "PetImportError";
    this.code = details.code;
    this.petId = details.petId;
    this.path = details.path;
  }
}

export async function importPetBundle(
  sourcePath: string,
  petsDir: string,
  replace = false
): Promise<ImportedPetBundle> {
  const source = await readBundle(sourcePath);
  const manifest = parseManifest(source.manifestBuffer);
  const normalizedManifest = normalizePetManifest(manifest);
  const petId = getPetId(manifest);
  validateSpritesheet(source.spritesheetBuffer);

  const destinationDir = join(petsDir, petId);
  if (!replace && (await exists(destinationDir))) {
    throw new PetImportError({
      code: "DUPLICATE_PET",
      message: `Pet "${petId}" already exists.`,
      petId,
      path: destinationDir
    });
  }

  if (replace) {
    await rm(destinationDir, { recursive: true, force: true });
  }

  await mkdir(destinationDir, { recursive: true });
  await writeFile(join(destinationDir, PET_JSON), `${JSON.stringify(normalizedManifest, null, 2)}\n`);
  await writeFile(join(destinationDir, SPRITESHEET), source.spritesheetBuffer);

  return {
    petId,
    manifest: normalizedManifest,
    destinationDir,
    replaced: replace
  };
}

async function readBundle(sourcePath: string): Promise<BundleFiles> {
  let sourceStat;
  try {
    sourceStat = await stat(sourcePath);
  } catch {
    throw new PetImportError({
      code: "SOURCE_NOT_FOUND",
      message: `Pet bundle source does not exist: ${sourcePath}`,
      path: sourcePath
    });
  }

  if (sourceStat.isDirectory()) {
    return readFolderBundle(sourcePath);
  }

  if (sourceStat.isFile() && extname(sourcePath).toLowerCase() === ".zip") {
    return readZipBundle(sourcePath);
  }

  throw new PetImportError({
    code: "UNSUPPORTED_SOURCE",
    message: "Pet bundle source must be a folder or .zip file.",
    path: sourcePath
  });
}

async function readFolderBundle(sourcePath: string): Promise<BundleFiles> {
  const rootFiles = await readBundleFilesFromFolder(sourcePath);
  if (rootFiles) {
    return rootFiles;
  }

  const entries = await readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const nestedFiles = await readBundleFilesFromFolder(join(sourcePath, entry.name));
    if (nestedFiles) {
      return nestedFiles;
    }
  }

  throw new PetImportError({
    code: "INVALID_BUNDLE",
    message: "Pet bundle must contain pet.json and spritesheet.webp at the root or one first-level folder.",
    path: sourcePath
  });
}

async function readBundleFilesFromFolder(folderPath: string): Promise<BundleFiles | null> {
  const manifestPath = join(folderPath, PET_JSON);
  const spritesheetPath = join(folderPath, SPRITESHEET);

  if (!(await exists(manifestPath)) || !(await exists(spritesheetPath))) {
    return null;
  }

  return {
    manifestBuffer: await readFile(manifestPath),
    spritesheetBuffer: await readFile(spritesheetPath)
  };
}

async function readZipBundle(sourcePath: string): Promise<BundleFiles> {
  const zip = await JSZip.loadAsync(await readFile(sourcePath));
  const files = Object.values(zip.files).filter((file) => !file.dir);

  for (const file of files) {
    validateZipEntryPath(file.unsafeOriginalName ?? file.name);
    validateZipEntryPath(file.name);
  }

  const rootFiles = getZipBundleEntries(files, "");
  if (rootFiles) {
    return rootFiles;
  }

  const firstLevelFolders = new Set<string>();
  for (const file of files) {
    const [folder] = file.name.split("/");
    if (folder && file.name.includes("/")) {
      firstLevelFolders.add(folder);
    }
  }

  for (const folder of firstLevelFolders) {
    const nestedFiles = getZipBundleEntries(files, `${folder}/`);
    if (nestedFiles) {
      return nestedFiles;
    }
  }

  throw new PetImportError({
    code: "INVALID_BUNDLE",
    message: "Pet bundle zip must contain pet.json and spritesheet.webp at the root or one first-level folder.",
    path: sourcePath
  });
}

function getZipBundleEntries(
  files: JSZip.JSZipObject[],
  prefix: string
): Promise<BundleFiles> | null {
  const manifestEntry = files.find((file) => file.name === `${prefix}${PET_JSON}`);
  const spritesheetEntry = files.find((file) => file.name === `${prefix}${SPRITESHEET}`);

  if (!manifestEntry || !spritesheetEntry) {
    return null;
  }

  return Promise.all([
    manifestEntry.async("nodebuffer"),
    spritesheetEntry.async("nodebuffer")
  ]).then(([manifestBuffer, spritesheetBuffer]) => ({
    manifestBuffer,
    spritesheetBuffer
  }));
}

function validateZipEntryPath(entryPath: string): void {
  const normalizedPath = entryPath.replaceAll("\\", "/");
  const segments = normalizedPath.split("/");

  if (
    normalizedPath.startsWith("/") ||
    normalizedPath.startsWith("\\") ||
    /^[a-z]:[\\/]/i.test(entryPath) ||
    segments.includes("..")
  ) {
    throw new PetImportError({
      code: "UNSAFE_ZIP_ENTRY",
      message: `Unsafe zip entry path: ${entryPath}`,
      path: entryPath
    });
  }
}

function parseManifest(buffer: Buffer): PetManifest {
  try {
    const manifest = JSON.parse(buffer.toString("utf8")) as unknown;
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("pet.json must contain an object.");
    }
    return manifest as PetManifest;
  } catch (error) {
    throw new PetImportError({
      code: "INVALID_PET_JSON",
      message: error instanceof Error ? error.message : "Invalid pet.json."
    });
  }
}

function normalizePetManifest(manifest: PetManifest): PetManifest {
  return {
    ...manifest,
    animationFrameCounts: normalizeAnimationFrameCounts(manifest.animationFrameCounts)
  };
}

function getPetId(manifest: PetManifest): string {
  const rawId = stringValue(manifest.id);
  const petId = rawId ?? slugifyName(stringValue(manifest.name));

  if (!petId || !PET_ID_PATTERN.test(petId)) {
    throw new PetImportError({
      code: "INVALID_PET_ID",
      message: "pet.json must provide an id matching /^[a-z0-9][a-z0-9_-]{1,47}$/i or a usable name.",
      petId
    });
  }

  return petId;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function slugifyName(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }

  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || undefined;
}

function validateSpritesheet(buffer: Buffer): void {
  let dimensions;
  try {
    dimensions = imageSize(buffer);
  } catch (error) {
    throw new PetImportError({
      code: "INVALID_SPRITESHEET",
      message: error instanceof Error ? error.message : "Invalid spritesheet.webp."
    });
  }

  if (
    dimensions.type !== "webp" ||
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width % 8 !== 0 ||
    dimensions.height % 9 !== 0
  ) {
    throw new PetImportError({
      code: "INVALID_SPRITESHEET_DIMENSIONS",
      message: "spritesheet.webp width must be divisible by 8 and height must be divisible by 9."
    });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
