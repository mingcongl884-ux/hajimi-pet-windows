import { createTaskCard, shouldShowTaskCard, updateTaskPhase, type TaskCard } from "./taskCards.js";

export type OfficeTaskStatus = "idle" | "starting" | "processing" | "completed" | "failed" | "cancelled";

export type OfficeTaskState = {
  status: OfficeTaskStatus;
  lastFailedMessage?: string;
  activeTaskCard?: TaskCard;
  activeTaskInput?: string;
};

export type StartOfficeTaskOptions = {
  input: string;
  hasAttachment?: boolean;
  now?: number;
};

export type RetryOfficeTaskOptions = {
  now?: number;
  hasAttachment?: boolean;
};

export function createOfficeTaskState(initialState: Partial<OfficeTaskState> = {}): OfficeTaskState {
  return {
    status: "idle",
    ...initialState
  };
}

export function startOfficeTask(state: OfficeTaskState, options: StartOfficeTaskOptions): OfficeTaskState {
  const now = options.now ?? Date.now();
  const activeTaskCard = shouldShowTaskCard(options.input, options.hasAttachment)
    ? updateTaskPhase(createTaskCard(options.input, now), "processing", now)
    : undefined;

  return {
    ...state,
    status: "processing",
    lastFailedMessage: undefined,
    activeTaskCard,
    activeTaskInput: options.input
  };
}

export function completeOfficeTask(state: OfficeTaskState, now = Date.now()): OfficeTaskState {
  return finishOfficeTask(state, "completed", now);
}

export function failOfficeTask(state: OfficeTaskState, message: string, now = Date.now()): OfficeTaskState {
  return {
    ...state,
    status: "failed",
    lastFailedMessage: state.activeTaskInput ?? state.lastFailedMessage,
    activeTaskCard: state.activeTaskCard ? updateTaskPhase(state.activeTaskCard, "failed", now, message) : undefined
  };
}

export function cancelOfficeTask(state: OfficeTaskState, now = Date.now()): OfficeTaskState {
  return finishOfficeTask(state, "cancelled", now);
}

export function retryOfficeTask(state: OfficeTaskState, options: RetryOfficeTaskOptions = {}): OfficeTaskState {
  if (!state.lastFailedMessage) {
    return state;
  }
  return startOfficeTask(state, {
    input: state.lastFailedMessage,
    hasAttachment: options.hasAttachment,
    now: options.now
  });
}

function finishOfficeTask(
  state: OfficeTaskState,
  status: Extract<OfficeTaskStatus, "completed" | "cancelled">,
  now: number
): OfficeTaskState {
  return {
    ...state,
    status,
    activeTaskCard: state.activeTaskCard ? updateTaskPhase(state.activeTaskCard, status, now) : undefined
  };
}
