export type SkillScope = "global" | "project";
export type SkillSource = "managed" | "project" | "user-claude" | "bundled";
export type SkillUseMode = "auto" | "off" | "pinned";

export type OfficeSkillRequest = {
  mode?: SkillUseMode;
  pinnedSkillIds?: string[];
};

export type ManagedSkill = {
  id: string;
  name: string;
  description: string;
  path: string;
  source: SkillSource;
  enabled: boolean;
  scope: SkillScope;
  projectPath?: string;
  importedAt: string;
  updatedAt: string;
  warnings: string[];
};

export type ParsedSkillMarkdown = {
  name: string;
  description: string;
  body: string;
  warnings: string[];
};

export type LoadedSkill = {
  skill: ManagedSkill;
  body: string;
};

export type ResolvedSkillContext = {
  mode: SkillUseMode;
  availableSkills: ManagedSkill[];
  loadedSkills: LoadedSkill[];
  pinnedSkillNames: string[];
  invocation?: {
    skillName: string;
    prompt: string;
  };
  contextText: string;
};

export type SkillContextTextOptions = {
  availableSkills: ManagedSkill[];
  loadedSkills?: LoadedSkill[];
};

export function normalizeSkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    || "skill";
}

export function parseSkillMarkdown(markdown: string, folderName: string): ParsedSkillMarkdown {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const fallbackName = normalizeSkillName(folderName);
  const name = normalizeSkillName(frontmatter.name ?? fallbackName);
  const description = (frontmatter.description ?? folderName).trim() || name;
  const warnings = detectSkillWarnings(markdown);
  return {
    name,
    description,
    body: body.trim(),
    warnings
  };
}

export function resolveSkillInvocation(
  text: string,
  skillNames: string[]
): { skillName: string; prompt: string } | undefined {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }
  const match = trimmed.match(/^\/([^\s/]+)(?:\s+([\s\S]*))?$/u);
  if (!match) {
    return undefined;
  }
  const requested = normalizeSkillName(match[1]);
  const normalizedNames = new Map(skillNames.map((name) => [normalizeSkillName(name), name]));
  const skillName = normalizedNames.get(requested);
  if (!skillName) {
    return undefined;
  }
  return {
    skillName,
    prompt: (match[2] ?? "").trim()
  };
}

export function buildSkillContextText(options: SkillContextTextOptions): string {
  const enabled = options.availableSkills.filter((skill) => skill.enabled);
  if (!enabled.length && !options.loadedSkills?.length) {
    return "";
  }
  const lines = [
    "Available HaJiMi skills:",
    ...enabled.map((skill) => `- ${skill.name}: ${skill.description}`)
  ];
  const loadedSkills = options.loadedSkills ?? [];
  if (loadedSkills.length) {
    lines.push("", "Loaded skill instructions:");
    for (const loaded of loadedSkills) {
      lines.push(`## ${loaded.skill.name}`, loaded.body.trim());
    }
  }
  return lines.join("\n").trim();
}

function splitFrontmatter(markdown: string): { frontmatter: Record<string, string>; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: normalized };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) {
    return { frontmatter: {}, body: normalized };
  }
  const rawFrontmatter = normalized.slice(4, end);
  const bodyStart = normalized.indexOf("\n", end + 4);
  return {
    frontmatter: parseSimpleFrontmatter(rawFrontmatter),
    body: bodyStart >= 0 ? normalized.slice(bodyStart + 1) : ""
  };
}

function parseSimpleFrontmatter(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/u);
    if (!match) {
      continue;
    }
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function detectSkillWarnings(markdown: string): string[] {
  const text = markdown.toLowerCase();
  const warnings: string[] = [];
  if (/rm\s+-rf|remove-item|format\s+|delete\s+all|powershell|cmd\.exe|shell|bash/u.test(text)) {
    warnings.push("包含 shell/命令执行相关说明，使用时仍受办公权限限制。");
  }
  if (/api[_ -]?key|password|credential|secret|token/u.test(text)) {
    warnings.push("包含密钥或凭据相关文字，请确认技能文件里没有真实敏感信息。");
  }
  return warnings;
}
