import { Download, FolderOpen, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentPermissionMode, AppSettings } from "../../electron/settingsStore";
import type { PetAppState } from "../global";

type Props = {
  state: PetAppState;
  onClose(): void;
  onImport(): Promise<void>;
  onSwitchPet(petId: string): Promise<void>;
  onChooseWorkspace(): Promise<void>;
  onSave(settings: AppSettings): Promise<void>;
};

const permissionOptions: Array<{ id: AgentPermissionMode; label: string }> = [
  { id: "default", label: "默认权限" },
  { id: "auto-review", label: "自动审查" },
  { id: "full-access", label: "完全访问权限" }
];

export default function SettingsPanel({
  state,
  onClose,
  onImport,
  onSwitchPet,
  onChooseWorkspace,
  onSave
}: Props) {
  const [settings, setSettings] = useState<AppSettings>(state.settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => setSettings(state.settings), [state.settings]);

  async function save(nextSettings = settings) {
    setSaving(true);
    await onSave(nextSettings);
    setSaving(false);
  }

  async function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    await save(next);
  }

  async function chooseWorkspace() {
    setSaving(true);
    await onChooseWorkspace();
    setSaving(false);
  }

  return (
    <section className="settings-panel">
      <header>
        <strong>快速设置</strong>
        <button title="关闭" onClick={onClose}>
          <X size={15} />
        </button>
      </header>

      <label>
        当前宠物
        <select value={state.settings.activePetId} onChange={(event) => void onSwitchPet(event.target.value)}>
          {state.pets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.displayName}
            </option>
          ))}
        </select>
      </label>

      <button className="wide-button" onClick={() => void onImport()}>
        <Download size={16} />
        导入宠物
      </button>

      <label className="toggle-row">
        <span>自主走动</span>
        <input
          type="checkbox"
          checked={settings.movementEnabled}
          onChange={(event) => void update("movementEnabled", event.target.checked)}
        />
      </label>

      <label className="toggle-row">
        <span>多宠物一起玩耍</span>
        <input
          type="checkbox"
          checked={settings.playTogetherEnabled}
          onChange={(event) => void update("playTogetherEnabled", event.target.checked)}
        />
      </label>

      <label>
        活跃度
        <select
          value={settings.movementIntensity}
          onChange={(event) => void update("movementIntensity", event.target.value as AppSettings["movementIntensity"])}
        >
          <option value="calm">安静</option>
          <option value="normal">自然</option>
          <option value="lively">活泼</option>
        </select>
      </label>

      <button className="wide-button" onClick={() => void chooseWorkspace()}>
        <FolderOpen size={16} />
        选择办公区
      </button>

      <label>
        项目权限
        <select
          value={settings.agent.permissionMode}
          onChange={(event) => {
            const permissionMode = event.target.value as AgentPermissionMode;
            const next = {
              ...settings,
              agent: {
                ...settings.agent,
                permissionMode,
                allowCommands: permissionMode !== "default"
              }
            };
            setSettings(next);
            void save(next);
          }}
        >
          {permissionOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="toggle-row">
        <span>心跳问候</span>
        <input
          type="checkbox"
          checked={settings.heartbeat.enabled}
          onChange={(event) => {
            const next = {
              ...settings,
              heartbeat: { ...settings.heartbeat, enabled: event.target.checked }
            };
            setSettings(next);
            void save(next);
          }}
        />
      </label>

      <label className="toggle-row">
        <span>模型自由问候</span>
        <input
          type="checkbox"
          checked={settings.heartbeat.modelGreetingEnabled}
          onChange={(event) => {
            const next = {
              ...settings,
              heartbeat: { ...settings.heartbeat, modelGreetingEnabled: event.target.checked }
            };
            setSettings(next);
            void save(next);
          }}
        />
      </label>

      <label className="toggle-row">
        <span>忙碌时收成气泡</span>
        <input
          type="checkbox"
          checked={settings.heartbeat.collapseToBubbleEnabled}
          onChange={(event) => {
            const next = {
              ...settings,
              heartbeat: { ...settings.heartbeat, collapseToBubbleEnabled: event.target.checked }
            };
            setSettings(next);
            void save(next);
          }}
        />
      </label>

      <label>
        API Base URL
        <input
          value={settings.api.baseUrl}
          onChange={(event) => setSettings({ ...settings, api: { ...settings.api, baseUrl: event.target.value } })}
          onBlur={() => void save()}
        />
      </label>

      <label>
        API Key
        <input
          type="password"
          value={settings.api.apiKey}
          onChange={(event) => setSettings({ ...settings, api: { ...settings.api, apiKey: event.target.value } })}
          onBlur={() => void save()}
        />
      </label>

      <label>
        Model
        <input
          value={settings.api.model}
          onChange={(event) => setSettings({ ...settings, api: { ...settings.api, model: event.target.value } })}
          onBlur={() => void save()}
        />
      </label>

      {saving && <p className="muted">保存中</p>}
    </section>
  );
}
