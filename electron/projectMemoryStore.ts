import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  updateProjectMemory,
  type ProjectMemory,
  type ProjectMemoryUpdate
} from "../src/lib/projectMemory.js";

type ProjectMemoryFile = {
  memories?: Record<string, ProjectMemory>;
};

export class ProjectMemoryStore {
  private readonly filePath: string;
  private saveQueue = Promise.resolve();
  private tempCounter = 0;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, "project-memory.json");
  }

  async getMemory(projectId: string): Promise<ProjectMemory | undefined> {
    const file = await this.loadFile();
    return file.memories?.[projectId];
  }

  async updateMemory(update: ProjectMemoryUpdate): Promise<ProjectMemory> {
    const pendingSave = this.saveQueue.then(async () => {
      const file = await this.loadFile();
      const memory = updateProjectMemory(file.memories?.[update.projectId], update);
      await this.writeFile({
        memories: {
          ...(file.memories ?? {}),
          [update.projectId]: memory
        }
      });
      return memory;
    });
    this.saveQueue = pendingSave.then(() => undefined, () => undefined);
    return pendingSave;
  }

  private async loadFile(): Promise<ProjectMemoryFile> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { memories: {} };
      }
      throw error;
    }

    try {
      return JSON.parse(content) as ProjectMemoryFile;
    } catch {
      await this.backupCorruptFile();
      return { memories: {} };
    }
  }

  private async writeFile(file: ProjectMemoryFile) {
    await mkdir(this.userDataDir, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${this.tempCounter += 1}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    try {
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async backupCorruptFile() {
    const backupPath = `${this.filePath}.corrupt-${Date.now()}-${this.tempCounter += 1}`;
    await rename(this.filePath, backupPath);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
