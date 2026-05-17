import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { parseSkillMarkdown, type ManagedSkill, type SkillScope } from "../src/lib/skills.js";

type SkillRegistryFile = {
  skills?: ManagedSkill[];
};

export type SkillUpdatePatch = Partial<Pick<ManagedSkill, "enabled" | "scope" | "projectPath">>;

export class SkillStore {
  private readonly skillsDir: string;
  private readonly managedDir: string;
  private readonly registryPath: string;
  private saveQueue = Promise.resolve();
  private tempCounter = 0;

  constructor(private readonly userDataDir: string) {
    this.skillsDir = join(userDataDir, "skills");
    this.managedDir = join(this.skillsDir, "managed");
    this.registryPath = join(this.skillsDir, "registry.json");
  }

  async listSkills(): Promise<ManagedSkill[]> {
    const registry = await this.loadRegistry();
    return registry.skills ?? [];
  }

  async importSkillFolder(sourceDir: string): Promise<ManagedSkill> {
    const sourcePath = resolve(sourceDir);
    const markdown = await readFile(join(sourcePath, "SKILL.md"), "utf8").catch((error) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error("没有找到 SKILL.md。请选择包含 SKILL.md 的技能文件夹。");
      }
      throw error;
    });
    const parsed = parseSkillMarkdown(markdown, basename(sourcePath));
    const now = new Date().toISOString();
    const registry = await this.loadRegistry();
    const id = createSkillId(parsed.name, registry.skills ?? []);
    const targetPath = join(this.managedDir, id);
    await mkdir(this.managedDir, { recursive: true });
    await rm(targetPath, { recursive: true, force: true });
    await cp(sourcePath, targetPath, { recursive: true });

    const skill: ManagedSkill = {
      id,
      name: parsed.name,
      description: parsed.description,
      path: targetPath,
      source: "managed",
      enabled: true,
      scope: "global",
      importedAt: now,
      updatedAt: now,
      warnings: parsed.warnings
    };
    await this.writeRegistry({
      skills: [...(registry.skills ?? []), skill]
    });
    return skill;
  }

  async updateSkill(id: string, patch: SkillUpdatePatch): Promise<ManagedSkill> {
    const pending = this.saveQueue.then(async () => {
      const registry = await this.loadRegistry();
      const skills = registry.skills ?? [];
      const index = skills.findIndex((skill) => skill.id === id);
      if (index < 0) {
        throw new Error(`Skill not found: ${id}`);
      }
      const current = skills[index];
      const scope: SkillScope = patch.scope ?? current.scope;
      const updated: ManagedSkill = {
        ...current,
        ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
        scope,
        projectPath: scope === "project" ? patch.projectPath ?? current.projectPath : undefined,
        updatedAt: new Date().toISOString()
      };
      const nextSkills = skills.map((skill) => skill.id === id ? updated : skill);
      await this.writeRegistry({ skills: nextSkills });
      return updated;
    });
    this.saveQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async removeSkill(id: string): Promise<void> {
    const pending = this.saveQueue.then(async () => {
      const registry = await this.loadRegistry();
      const skill = registry.skills?.find((item) => item.id === id);
      const skills = (registry.skills ?? []).filter((item) => item.id !== id);
      await this.writeRegistry({ skills });
      if (skill?.source === "managed") {
        await rm(skill.path, { recursive: true, force: true });
      }
    });
    this.saveQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async readSkillBody(skill: ManagedSkill): Promise<string> {
    const markdown = await readFile(join(skill.path, "SKILL.md"), "utf8");
    return parseSkillMarkdown(markdown, skill.name).body;
  }

  private async loadRegistry(): Promise<SkillRegistryFile> {
    let content: string;
    try {
      content = await readFile(this.registryPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { skills: [] };
      }
      throw error;
    }
    try {
      const parsed = JSON.parse(content) as SkillRegistryFile;
      return {
        skills: Array.isArray(parsed.skills) ? parsed.skills : []
      };
    } catch {
      await rename(this.registryPath, `${this.registryPath}.corrupt-${Date.now()}-${this.tempCounter += 1}`);
      return { skills: [] };
    }
  }

  private async writeRegistry(registry: SkillRegistryFile) {
    await mkdir(this.skillsDir, { recursive: true });
    const tempPath = `${this.registryPath}.${process.pid}.${Date.now()}.${this.tempCounter += 1}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    try {
      await rename(tempPath, this.registryPath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

function createSkillId(name: string, existing: ManagedSkill[]): string {
  const used = new Set(existing.map((skill) => skill.id));
  if (!used.has(name)) {
    return name;
  }
  for (let index = 2; ; index += 1) {
    const candidate = `${name}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
