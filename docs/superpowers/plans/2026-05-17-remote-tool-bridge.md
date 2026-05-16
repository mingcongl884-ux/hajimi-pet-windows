# Remote Tool Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LAN remote tool bridge where computer B's HaJiMi agent can call permissioned tools on computer A without A needing a model or API key.

**Architecture:** Add a host-side remote bridge service in Electron main using built-in Node HTTP JSON endpoints for the first implementation, then route controller-side agent tool calls through a selected execution environment. Host permissions remain authoritative and are enforced before every tool call.

**Tech Stack:** Electron main IPC, Node `http`, React settings UI, existing `AgentSettings`, existing office tool helpers, Vitest source and unit tests.

---

### Task 1: Shared Remote Bridge Types And Settings

**Files:**
- Create: `src/lib/remoteBridge.ts`
- Modify: `electron/settingsStore.ts`
- Test: `tests/remoteBridgeSettings.test.ts`

- [ ] **Step 1: Write the failing settings test**

```ts
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsStore } from "../electron/settingsStore";

describe("remote bridge settings", () => {
  it("hydrates default bridge settings without a model on the host", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hajimi-remote-bridge-"));
    const store = new SettingsStore(dir);

    const settings = await store.loadSettings();

    expect(settings.remoteBridge.enabled).toBe(false);
    expect(settings.remoteBridge.host.port).toBe(18031);
    expect(settings.remoteBridge.host.permissionMode).toBe("default");
    expect(settings.remoteBridge.trustedDevices).toEqual([]);
    expect(settings.remoteBridge.knownHosts).toEqual([]);
    expect(settings.remoteBridge.activeTargetId).toBe("local");
    expect(DEFAULT_SETTINGS.remoteBridge.activeTargetId).toBe("local");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- tests/remoteBridgeSettings.test.ts`

Expected: TypeScript or runtime failure because `remoteBridge` does not exist.

- [ ] **Step 3: Add shared types and defaults**

Create `src/lib/remoteBridge.ts`:

```ts
import type { AgentPermissionMode } from "../../electron/settingsStore.js";

export type RemoteBridgeTargetId = "local" | string;
export type RemoteBridgeStatus = "disabled" | "listening" | "connected" | "error";

export type RemoteTrustedDevice = {
  id: string;
  name: string;
  token: string;
  permissionMode: AgentPermissionMode;
  allowedWorkspace: string;
  pairedAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
};

export type RemoteKnownHost = {
  id: string;
  name: string;
  address: string;
  token: string;
  permissionMode: AgentPermissionMode;
  lastConnectedAt?: string;
};

export type RemoteBridgeSettings = {
  enabled: boolean;
  deviceName: string;
  activeTargetId: RemoteBridgeTargetId;
  host: {
    port: number;
    status: RemoteBridgeStatus;
    pairingCode?: string;
    pairingExpiresAt?: string;
    permissionMode: AgentPermissionMode;
  };
  trustedDevices: RemoteTrustedDevice[];
  knownHosts: RemoteKnownHost[];
};

export function defaultRemoteBridgeSettings(deviceName = "HaJiMi Host"): RemoteBridgeSettings {
  return {
    enabled: false,
    deviceName,
    activeTargetId: "local",
    host: {
      port: 18031,
      status: "disabled",
      permissionMode: "default"
    },
    trustedDevices: [],
    knownHosts: []
  };
}

export function cloneRemoteBridgeSettings(settings?: Partial<RemoteBridgeSettings>): RemoteBridgeSettings {
  const defaults = defaultRemoteBridgeSettings();
  return {
    ...defaults,
    ...settings,
    activeTargetId: settings?.activeTargetId || "local",
    host: {
      ...defaults.host,
      ...settings?.host
    },
    trustedDevices: settings?.trustedDevices ? [...settings.trustedDevices] : [],
    knownHosts: settings?.knownHosts ? [...settings.knownHosts] : []
  };
}
```

Modify `electron/settingsStore.ts` to import `RemoteBridgeSettings`, `cloneRemoteBridgeSettings`, `defaultRemoteBridgeSettings`; add `remoteBridge: RemoteBridgeSettings` to `AppSettings`; add `remoteBridge: defaultRemoteBridgeSettings()` to `DEFAULT_SETTINGS`; and hydrate with `remoteBridge: cloneRemoteBridgeSettings(stored.remoteBridge)`.

- [ ] **Step 4: Run the test**

Run: `npm.cmd test -- tests/remoteBridgeSettings.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/remoteBridge.ts electron/settingsStore.ts tests/remoteBridgeSettings.test.ts
git commit -m "Add remote bridge settings"
```

### Task 2: Host Permission Policy

**Files:**
- Modify: `src/lib/remoteBridge.ts`
- Test: `tests/remoteBridgePolicy.test.ts`

- [ ] **Step 1: Write the failing policy test**

```ts
import { describe, expect, it } from "vitest";
import { canRunRemoteTool } from "../src/lib/remoteBridge";

describe("remote bridge permission policy", () => {
  it("keeps default permission read-only", () => {
    expect(canRunRemoteTool("default", "listFiles")).toEqual({ allowed: true });
    expect(canRunRemoteTool("default", "readFile")).toEqual({ allowed: true });
    expect(canRunRemoteTool("default", "writeFile")).toEqual({ allowed: false, reason: "permission-denied" });
    expect(canRunRemoteTool("default", "runCommand")).toEqual({ allowed: false, reason: "permission-denied" });
  });

  it("requires review for risky auto-review tools", () => {
    expect(canRunRemoteTool("auto-review", "writeFile")).toEqual({ allowed: true });
    expect(canRunRemoteTool("auto-review", "openApplication")).toEqual({ allowed: false, reason: "review-required" });
    expect(canRunRemoteTool("auto-review", "runCommand")).toEqual({ allowed: false, reason: "review-required" });
  });

  it("allows full access to run complete host tools", () => {
    expect(canRunRemoteTool("full-access", "runCommand")).toEqual({ allowed: true });
    expect(canRunRemoteTool("full-access", "openApplication")).toEqual({ allowed: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- tests/remoteBridgePolicy.test.ts`

Expected: FAIL because `canRunRemoteTool` does not exist.

- [ ] **Step 3: Implement the policy**

Add to `src/lib/remoteBridge.ts`:

```ts
export type RemoteToolName =
  | "listFiles"
  | "readFile"
  | "writeFile"
  | "inspectDocument"
  | "createSpreadsheet"
  | "splitSpreadsheet"
  | "systemStatus"
  | "processList"
  | "openApplication"
  | "runCommand";

export type RemoteToolDecision =
  | { allowed: true }
  | { allowed: false; reason: "permission-denied" | "review-required" };

const DEFAULT_TOOLS = new Set<RemoteToolName>(["listFiles", "readFile", "inspectDocument", "systemStatus", "processList"]);
const AUTO_TOOLS = new Set<RemoteToolName>([
  "listFiles",
  "readFile",
  "writeFile",
  "inspectDocument",
  "createSpreadsheet",
  "splitSpreadsheet",
  "systemStatus",
  "processList"
]);

export function canRunRemoteTool(permissionMode: AgentPermissionMode, tool: RemoteToolName): RemoteToolDecision {
  if (permissionMode === "full-access") {
    return { allowed: true };
  }
  if (permissionMode === "auto-review") {
    return AUTO_TOOLS.has(tool) ? { allowed: true } : { allowed: false, reason: "review-required" };
  }
  return DEFAULT_TOOLS.has(tool) ? { allowed: true } : { allowed: false, reason: "permission-denied" };
}
```

- [ ] **Step 4: Run the test**

Run: `npm.cmd test -- tests/remoteBridgePolicy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/remoteBridge.ts tests/remoteBridgePolicy.test.ts
git commit -m "Add remote bridge permission policy"
```

### Task 3: Host Tool Executor

**Files:**
- Modify: `electron/agentClient.ts`
- Create: `electron/remoteBridgeTools.ts`
- Test: `tests/remoteBridgeTools.test.ts`

- [ ] **Step 1: Write the failing executor test**

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { executeRemoteBridgeTool } from "../electron/remoteBridgeTools";

describe("remote bridge tools", () => {
  it("runs read-only host tools without a model", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-tools-"));
    await writeFile(join(workspace, "README.md"), "hello remote", "utf8");

    const result = await executeRemoteBridgeTool({
      workspaceDir: workspace,
      permissionMode: "default",
      tool: "readFile",
      args: { path: "README.md" }
    });

    expect(result.content).toContain("hello remote");
  });

  it("blocks default writes and allows full access writes", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-tools-"));

    await expect(executeRemoteBridgeTool({
      workspaceDir: workspace,
      permissionMode: "default",
      tool: "writeFile",
      args: { path: "a.txt", content: "blocked" }
    })).rejects.toThrow(/permission/i);

    await executeRemoteBridgeTool({
      workspaceDir: workspace,
      permissionMode: "full-access",
      tool: "writeFile",
      args: { path: "a.txt", content: "allowed" }
    });

    expect(await readFile(join(workspace, "a.txt"), "utf8")).toBe("allowed");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- tests/remoteBridgeTools.test.ts`

Expected: FAIL because the executor does not exist.

- [ ] **Step 3: Export reusable local tools from `agentClient.ts`**

Rename private helpers to exported functions:

```ts
export async function listWorkspaceFiles(workspaceDir: string, relativePath: string): Promise<string> {
  const dir = resolveWorkspacePath(workspaceDir, relativePath);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .slice(0, 200)
    .map((entry) => `${entry.isDirectory() ? "dir " : "file"} ${entry.name}`)
    .join("\n") || "(empty)";
}

export async function readWorkspaceTextFile(workspaceDir: string, relativePath: string): Promise<string> {
  const filePath = resolveWorkspacePath(workspaceDir, relativePath);
  return trimToolOutput(await readFile(filePath, "utf8"));
}

export async function writeWorkspaceTextFile(agent: AgentSettings, relativePath: string, content: string): Promise<ToolResult> {
  const filePath = resolveWritablePath(agent, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return {
    content: `Wrote ${relativePath}`,
    fileOutput: {
      path: relativePath,
      name: basename(relativePath),
      size: Buffer.byteLength(content, "utf8")
    }
  };
}

export async function openWorkspaceApplication(agent: AgentSettings, appName: string): Promise<string> {
  const policy = getCommandPolicy(agent);
  if (!policy.enabled) {
    return "Application launch is disabled in the current permission mode. Switch to auto-review or full-access and try again.";
  }

  const command = buildOpenApplicationCommand(appName);
  const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", command], agent.workspaceDir, 15000);
  return `${result.output}\nExit code: ${result.code}`;
}

export async function runWorkspaceCommand(agent: AgentSettings, command: string): Promise<string> {
  const policy = getCommandPolicy(agent);
  if (!policy.enabled) {
    return "Command execution is disabled in settings.";
  }
  if (policy.blockDangerousCommands && isDangerousCommand(command)) {
    return "Blocked a potentially destructive command.";
  }

  const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", command], agent.workspaceDir, 60000);
  return `${result.output}\nExit code: ${result.code}`;
}
```

Update `executeToolCall` to call the exported helper names.

- [ ] **Step 4: Implement `remoteBridgeTools.ts`**

```ts
import type { AgentPermissionMode, AgentSettings } from "./settingsStore.js";
import { inspectDocumentFile, createSpreadsheetFile, splitSpreadsheetFile, buildSystemStatusCommand, buildProcessListCommand } from "./officeTools.js";
import { listWorkspaceFiles, openWorkspaceApplication, readWorkspaceTextFile, runWorkspaceCommand, writeWorkspaceTextFile } from "./agentClient.js";
import { canRunRemoteTool, type RemoteToolName } from "../src/lib/remoteBridge.js";

export type RemoteBridgeToolRequest = {
  workspaceDir: string;
  permissionMode: AgentPermissionMode;
  tool: RemoteToolName;
  args: Record<string, unknown>;
};

export async function executeRemoteBridgeTool(request: RemoteBridgeToolRequest) {
  const decision = canRunRemoteTool(request.permissionMode, request.tool);
  if (!decision.allowed) {
    throw new Error(`Remote tool denied: ${decision.reason}`);
  }

  const agent: AgentSettings = {
    workspaceDir: request.workspaceDir,
    permissionMode: request.permissionMode,
    allowCommands: request.permissionMode !== "default"
  };

  switch (request.tool) {
    case "listFiles":
      return { content: await listWorkspaceFiles(request.workspaceDir, String(request.args.path ?? ".")) };
    case "readFile":
      return { content: await readWorkspaceTextFile(request.workspaceDir, String(request.args.path ?? "")) };
    case "writeFile":
      return writeWorkspaceTextFile(agent, String(request.args.path ?? ""), String(request.args.content ?? ""));
    case "inspectDocument":
      return inspectDocumentFile(request.workspaceDir, String(request.args.path ?? ""));
    case "createSpreadsheet":
      return createSpreadsheetFile(agent, {
        path: String(request.args.path ?? ""),
        headers: Array.isArray(request.args.headers) ? request.args.headers.map(String) : undefined,
        rows: Array.isArray(request.args.rows) ? request.args.rows as Array<Array<string | number | boolean | null | undefined>> : []
      });
    case "splitSpreadsheet":
      return splitSpreadsheetFile(agent, {
        path: String(request.args.path ?? ""),
        parts: typeof request.args.parts === "number" ? request.args.parts : undefined,
        rowsPerFile: typeof request.args.rowsPerFile === "number" ? request.args.rowsPerFile : undefined,
        outputDir: typeof request.args.outputDir === "string" ? request.args.outputDir : undefined
      });
    case "systemStatus":
      return { content: await runWorkspaceCommand({ ...agent, permissionMode: "full-access", allowCommands: true }, buildSystemStatusCommand()) };
    case "processList":
      return { content: await runWorkspaceCommand({ ...agent, permissionMode: "full-access", allowCommands: true }, buildProcessListCommand(Number(request.args.limit ?? 12))) };
    case "openApplication":
      return { content: await openWorkspaceApplication(agent, String(request.args.appName ?? request.args.name ?? "")) };
    case "runCommand":
      return { content: await runWorkspaceCommand(agent, String(request.args.command ?? "")) };
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npm.cmd test -- tests/remoteBridgeTools.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add electron/agentClient.ts electron/remoteBridgeTools.ts tests/remoteBridgeTools.test.ts
git commit -m "Add remote bridge host tool executor"
```

### Task 4: Host HTTP Bridge Service

**Files:**
- Create: `electron/remoteBridgeHost.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Test: `tests/remoteBridgeHost.test.ts`
- Test: `tests/remoteBridgeSource.test.ts`

- [ ] **Step 1: Write host service tests**

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { startRemoteBridgeHost, type RemoteBridgeHostController } from "../electron/remoteBridgeHost";

let host: RemoteBridgeHostController | undefined;

afterEach(async () => {
  await host?.stop();
  host = undefined;
});

describe("remote bridge host", () => {
  it("pairs and executes a trusted read tool", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "hajimi-remote-host-"));
    await writeFile(join(workspace, "README.md"), "from host", "utf8");

    host = await startRemoteBridgeHost({
      port: 0,
      pairingCode: "123456",
      pairingExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      workspaceDir: workspace,
      permissionMode: "default",
      trustedDevices: [],
      onTrustDevice: async (device) => device,
      onAudit: async () => undefined
    });

    const pair = await fetch(`${host.url}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingCode: "123456", deviceName: "Laptop B" })
    }).then((response) => response.json()) as { token: string; deviceId: string };

    const result = await fetch(`${host.url}/tool`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${pair.token}` },
      body: JSON.stringify({ requestId: "r1", tool: "readFile", args: { path: "README.md" } })
    }).then((response) => response.json()) as { content: string };

    expect(pair.deviceId).toBeTruthy();
    expect(result.content).toContain("from host");
  });
});
```

- [ ] **Step 2: Run the host test to verify it fails**

Run: `npm.cmd test -- tests/remoteBridgeHost.test.ts`

Expected: FAIL because `remoteBridgeHost` does not exist.

- [ ] **Step 3: Implement the host service**

Create a Node `http` server with:

- `GET /status`
- `POST /pair`
- `POST /tool`

Every `/tool` request must verify the bearer token against trusted devices and call `executeRemoteBridgeTool`.

- [ ] **Step 4: Wire IPC in `main.ts`**

Add IPC handlers:

- `pet:start-remote-bridge`
- `pet:stop-remote-bridge`
- `pet:generate-remote-pairing-code`
- `pet:revoke-remote-device`
- `pet:call-remote-tool`

When settings are saved, start or stop the host listener based on `settings.remoteBridge.enabled`.

- [ ] **Step 5: Add preload and global types**

Expose matching methods on `window.petApp`.

- [ ] **Step 6: Run tests**

Run: `npm.cmd test -- tests/remoteBridgeHost.test.ts tests/remoteBridgeSource.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add electron/remoteBridgeHost.ts electron/main.ts electron/preload.ts electron/preload.cjs src/global.d.ts tests/remoteBridgeHost.test.ts tests/remoteBridgeSource.test.ts
git commit -m "Add remote bridge host service"
```

### Task 5: Controller Client And Agent Tool Routing

**Files:**
- Create: `electron/remoteBridgeClient.ts`
- Modify: `electron/agentClient.ts`
- Modify: `electron/main.ts`
- Test: `tests/remoteBridgeClient.test.ts`
- Test: `tests/remoteAgentRoutingSource.test.ts`

- [ ] **Step 1: Write client and routing tests**

Create tests that assert:

- A known host can call `/tool` with its token.
- Remote target context injects "Current execution environment".
- Agent tool execution routes to remote client when `targetDeviceId !== "local"`.

- [ ] **Step 2: Implement `remoteBridgeClient.ts`**

Implement:

```ts
export async function callRemoteBridgeTool(host: RemoteKnownHost, request: {
  requestId: string;
  tool: RemoteToolName;
  args: Record<string, unknown>;
}) {
  const response = await fetch(`${host.address.replace(/\/$/, "")}/tool`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${host.token}`
    },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
```

- [ ] **Step 3: Add agent routing option**

Add an optional target environment parameter to the ordinary agent path. When target is local, use existing tools. When target is remote, call `callRemoteBridgeTool`.

- [ ] **Step 4: Run routing tests**

Run: `npm.cmd test -- tests/remoteBridgeClient.test.ts tests/remoteAgentRoutingSource.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add electron/remoteBridgeClient.ts electron/agentClient.ts electron/main.ts tests/remoteBridgeClient.test.ts tests/remoteAgentRoutingSource.test.ts
git commit -m "Route ordinary agent tools to remote bridge targets"
```

### Task 6: UI For Bridge And Execution Environment

**Files:**
- Modify: `src/components/ManagerPage.tsx`
- Modify: `src/styles.css`
- Test: `tests/remoteBridgeUiSource.test.ts`

- [ ] **Step 1: Write UI source tests**

Assert ManagerPage contains:

- `remoteBridge`
- `activeTargetId`
- `execution-environment`
- `startRemoteBridge`
- `generateRemotePairingCode`
- `revokeRemoteDevice`

- [ ] **Step 2: Add host bridge controls**

In System or Channels section, add compact controls for:

- Enable bridge.
- Generate pairing code.
- Show listening address.
- Trusted devices list.
- Permission selector per device.
- Revoke.

- [ ] **Step 3: Add composer environment picker**

Place a compact picker near the model selector:

- `Local`
- Each `knownHost.name`

Changing the picker updates `settings.remoteBridge.activeTargetId`.

- [ ] **Step 4: Run UI source tests**

Run: `npm.cmd test -- tests/remoteBridgeUiSource.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/components/ManagerPage.tsx src/styles.css tests/remoteBridgeUiSource.test.ts
git commit -m "Add remote bridge UI controls"
```

### Task 7: Full Verification

**Files:**
- Modify only files needed to fix failures found by verification.

- [ ] **Step 1: Run full tests**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 2: Run build**

Run: `npm.cmd run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Manual two-instance smoke test**

Run one dev instance as host and one as controller using separate user data if practical. Verify:

- Host enables bridge.
- Pairing code is generated.
- Controller pairs.
- Controller reads a host workspace file.
- Default permission blocks write.
- Full access allows write.

- [ ] **Step 4: Commit final fixes**

Run:

```powershell
git add -A
git commit -m "Stabilize remote tool bridge"
```
