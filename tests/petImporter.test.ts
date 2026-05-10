import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { importPetBundle } from "../electron/petImporter";

const tempRoots: string[] = [];

function makeWebp(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(30);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(22, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write("VP8X", 12, "ascii");
  buffer.writeUInt32LE(10, 16);
  buffer[20] = 0;
  buffer.writeUIntLE(width - 1, 24, 3);
  buffer.writeUIntLE(height - 1, 27, 3);
  return buffer;
}

async function makeTempRoot() {
  const created = await mkdtemp(join(tmpdir(), "pet-importer-"));
  tempRoots.push(created);
  return created;
}

async function createBundleFolder(
  entries: Record<string, Buffer | string>,
  nestedFolder?: string
) {
  const root = await makeTempRoot();
  const source = nestedFolder ? join(root, nestedFolder) : root;
  await mkdir(source, { recursive: true });

  for (const [relativePath, content] of Object.entries(entries)) {
    const target = join(source, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  return { root, source: nestedFolder ? root : source };
}

async function createBundleZip(entries: Record<string, Buffer | string>) {
  const root = await makeTempRoot();
  const zip = new JSZip();

  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }

  const zipPath = join(root, "bundle.zip");
  await writeFile(zipPath, await zip.generateAsync({ type: "nodebuffer" }));
  return { root, zipPath };
}

describe("importPetBundle", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("imports a valid pet folder from the source root", async () => {
    const petsDir = await makeTempRoot();
    const { source } = await createBundleFolder({
      "pet.json": JSON.stringify({ id: "pixel_cat", name: "Pixel Cat" }),
      "spritesheet.webp": makeWebp(80, 90)
    });

    const result = await importPetBundle(source, petsDir);

    expect(result).toMatchObject({ petId: "pixel_cat", replaced: false });
    await expect(readFile(join(petsDir, "pixel_cat", "pet.json"), "utf8")).resolves.toContain(
      "Pixel Cat"
    );
    await expect(readFile(join(petsDir, "pixel_cat", "spritesheet.webp"))).resolves.toHaveLength(30);
  });

  it("fills missing animation frame counts for imported pets", async () => {
    const petsDir = await makeTempRoot();
    const { source } = await createBundleFolder({
      "pet.json": JSON.stringify({ id: "stable_pet", name: "Stable Pet" }),
      "spritesheet.webp": makeWebp(80, 90)
    });

    await importPetBundle(source, petsDir);
    const manifest = JSON.parse(await readFile(join(petsDir, "stable_pet", "pet.json"), "utf8"));

    expect(manifest.animationFrameCounts).toMatchObject({
      idle: 6,
      waving: 4,
      jumping: 5,
      waiting: 6,
      running: 6,
      review: 5
    });
  });

  it("imports a zip bundle from one first-level folder and derives a stable id from name", async () => {
    const petsDir = await makeTempRoot();
    const { zipPath } = await createBundleZip({
      "cozy-pet/pet.json": JSON.stringify({ name: "Cozy Pet" }),
      "cozy-pet/spritesheet.webp": makeWebp(128, 144)
    });

    const result = await importPetBundle(zipPath, petsDir);

    expect(result).toMatchObject({ petId: "cozy-pet", replaced: false });
    await expect(readFile(join(petsDir, "cozy-pet", "pet.json"), "utf8")).resolves.toContain(
      "Cozy Pet"
    );
  });

  it.each(["/pet.json", "../pet.json", "C:/pets/pet.json", "safe/../pet.json"])(
    "rejects unsafe zip entry path %s",
    async (unsafePath) => {
      const petsDir = await makeTempRoot();
      const { zipPath } = await createBundleZip({
        [unsafePath]: JSON.stringify({ id: "unsafe_pet", name: "Unsafe Pet" }),
        "spritesheet.webp": makeWebp(80, 90)
      });

      await expect(importPetBundle(zipPath, petsDir)).rejects.toMatchObject({
        code: "UNSAFE_ZIP_ENTRY"
      });
    }
  );

  it("rejects pet ids outside the supported stable id format", async () => {
    const petsDir = await makeTempRoot();
    const { source } = await createBundleFolder({
      "pet.json": JSON.stringify({ id: "x", name: "Too Short" }),
      "spritesheet.webp": makeWebp(80, 90)
    });

    await expect(importPetBundle(source, petsDir)).rejects.toMatchObject({
      code: "INVALID_PET_ID"
    });
  });

  it("rejects spritesheets that are not divisible into an 8 by 9 atlas", async () => {
    const petsDir = await makeTempRoot();
    const { source } = await createBundleFolder({
      "pet.json": JSON.stringify({ id: "bad_atlas", name: "Bad Atlas" }),
      "spritesheet.webp": makeWebp(81, 90)
    });

    await expect(importPetBundle(source, petsDir)).rejects.toMatchObject({
      code: "INVALID_SPRITESHEET_DIMENSIONS"
    });
  });

  it("returns a structured duplicate error when replace is false", async () => {
    const petsDir = await makeTempRoot();
    const { source } = await createBundleFolder({
      "pet.json": JSON.stringify({ id: "dupe_pet", name: "Dupe Pet" }),
      "spritesheet.webp": makeWebp(80, 90)
    });

    await importPetBundle(source, petsDir);

    await expect(importPetBundle(source, petsDir, false)).rejects.toMatchObject({
      code: "DUPLICATE_PET",
      petId: "dupe_pet"
    });
  });
});
