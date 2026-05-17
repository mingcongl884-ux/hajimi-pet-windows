import {
  buildSkillContextText,
  resolveSkillInvocation,
  type LoadedSkill,
  type ManagedSkill,
  type OfficeSkillRequest,
  type ResolvedSkillContext,
  type SkillUseMode
} from "../src/lib/skills.js";

export type { OfficeSkillRequest };

export type ResolveOfficeSkillContextOptions = {
  skills: ManagedSkill[];
  task: string;
  projectPath: string;
  mode: SkillUseMode;
  pinnedSkillIds: string[];
  readBody(skill: ManagedSkill): Promise<string>;
};

export async function resolveOfficeSkillContext(
  options: ResolveOfficeSkillContextOptions
): Promise<ResolvedSkillContext> {
  if (options.mode === "off") {
    return {
      mode: "off",
      availableSkills: [],
      loadedSkills: [],
      pinnedSkillNames: [],
      contextText: ""
    };
  }

  const availableSkills = options.skills.filter((skill) => isSkillAvailable(skill, options.projectPath));
  const invocation = resolveSkillInvocation(options.task, availableSkills.map((skill) => skill.name));
  const pinnedIds = new Set(options.pinnedSkillIds);
  const selectedSkills = availableSkills.filter((skill) => (
    (options.mode === "pinned" && pinnedIds.has(skill.id)) ||
    invocation?.skillName === skill.name
  ));
  const loadedSkills: LoadedSkill[] = [];
  for (const skill of selectedSkills.slice(0, 3)) {
    loadedSkills.push({ skill, body: await options.readBody(skill) });
  }

  return {
    mode: options.mode,
    availableSkills,
    loadedSkills,
    pinnedSkillNames: loadedSkills.map((loaded) => loaded.skill.name),
    invocation,
    contextText: buildSkillContextText({ availableSkills, loadedSkills })
  };
}

function isSkillAvailable(skill: ManagedSkill, projectPath: string): boolean {
  if (!skill.enabled) {
    return false;
  }
  if (skill.scope === "global") {
    return true;
  }
  return normalizePath(skill.projectPath) === normalizePath(projectPath);
}

function normalizePath(value: string | undefined): string {
  return (value ?? "").replace(/\\/g, "/").replace(/\/+$/u, "").toLowerCase();
}
