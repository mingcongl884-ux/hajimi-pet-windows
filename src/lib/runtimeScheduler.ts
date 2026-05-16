export type RuntimeScheduleTask<TaskId extends string = string> = {
  id: TaskId;
  intervalMs: number;
  runOnStart?: boolean;
  enabled?: boolean;
};

type RuntimeScheduleEntry<TaskId extends string> = RuntimeScheduleTask<TaskId> & {
  enabled: boolean;
  nextDueAt: number;
};

export function createRuntimeSchedule<TaskId extends string>(
  tasks: RuntimeScheduleTask<TaskId>[],
  startedAt = Date.now()
) {
  const entries = new Map<TaskId, RuntimeScheduleEntry<TaskId>>();

  for (const task of tasks) {
    const enabled = task.enabled ?? true;
    entries.set(task.id, {
      ...task,
      enabled,
      nextDueAt: task.runOnStart ? startedAt : startedAt + task.intervalMs
    });
  }

  return {
    tick(now = Date.now()) {
      const dueTasks: TaskId[] = [];
      for (const entry of entries.values()) {
        if (!entry.enabled || now < entry.nextDueAt) {
          continue;
        }

        dueTasks.push(entry.id);
        entry.nextDueAt = now + entry.intervalMs;
      }
      return dueTasks;
    },

    setEnabled(id: TaskId, enabled: boolean, now = Date.now()) {
      const entry = entries.get(id);
      if (!entry || entry.enabled === enabled) {
        return;
      }

      entry.enabled = enabled;
      entry.nextDueAt = entry.runOnStart ? now : now + entry.intervalMs;
    }
  };
}
