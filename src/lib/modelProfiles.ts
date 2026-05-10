import type { AppSettings, ChatModelPurpose, ModelProfile } from "../../electron/settingsStore.js";

const DEFAULT_MODEL_ID = "default";
const DEFAULT_MODEL_PROVIDER = "openai-compatible" as const;

export function ensureModelProfiles(settings: AppSettings): AppSettings {
  const models = settings.models?.length
    ? settings.models.map((model) => ({
      ...model,
      provider: model.provider === "claude-agent" ? "claude-agent" as const : DEFAULT_MODEL_PROVIDER
    }))
    : [{
      id: DEFAULT_MODEL_ID,
      name: "默认模型",
      provider: DEFAULT_MODEL_PROVIDER,
      baseUrl: settings.api.baseUrl,
      apiKey: settings.api.apiKey,
      model: settings.api.model,
      systemPrompt: settings.api.systemPrompt
    }];

  const firstModelId = models[0].id;
  const activeChatModelId = models.some((model) => model.id === settings.activeChatModelId)
    ? settings.activeChatModelId
    : firstModelId;
  const activeAgentModelId = models.some((model) => model.id === settings.activeAgentModelId)
    ? settings.activeAgentModelId
    : activeChatModelId;
  const activeChatModel = models.find((model) => model.id === activeChatModelId) ?? models[0];
  const modelIds = new Set(models.map((model) => model.id));
  const petModelBindings = Object.fromEntries(
    Object.entries(settings.petModelBindings ?? {}).filter(([, modelId]) => modelIds.has(modelId))
  );

  return {
    ...settings,
    models,
    petModelBindings,
    activeChatModelId,
    activeAgentModelId,
    api: {
      baseUrl: activeChatModel.baseUrl,
      apiKey: activeChatModel.apiKey,
      model: activeChatModel.model,
      systemPrompt: activeChatModel.systemPrompt
    }
  };
}

export function getActiveModelSettings(settings: AppSettings, purpose: ChatModelPurpose): ModelProfile {
  const prepared = ensureModelProfiles(settings);
  const activeId = purpose === "agent" ? prepared.activeAgentModelId : prepared.activeChatModelId;
  return prepared.models.find((model) => model.id === activeId) ?? prepared.models[0];
}

export function getModelSettingsById(
  settings: AppSettings,
  modelId: string | undefined,
  fallbackPurpose: ChatModelPurpose
): ModelProfile {
  const prepared = ensureModelProfiles(settings);
  return prepared.models.find((model) => model.id === modelId)
    ?? getActiveModelSettings(prepared, fallbackPurpose);
}

export function getPetModelSettings(
  settings: AppSettings,
  petId: string,
  fallbackPurpose: ChatModelPurpose
): ModelProfile {
  const prepared = ensureModelProfiles(settings);
  return getModelSettingsById(prepared, prepared.petModelBindings[petId], fallbackPurpose);
}

export function upsertModelProfile(settings: AppSettings, profile: ModelProfile): AppSettings {
  const prepared = ensureModelProfiles(settings);
  const exists = prepared.models.some((model) => model.id === profile.id);
  const models = exists
    ? prepared.models.map((model) => model.id === profile.id ? profile : model)
    : [...prepared.models, profile];
  return ensureModelProfiles({ ...prepared, models });
}
