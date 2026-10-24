import type { ParallelGroup, ParallelTask } from "../types";

/** Stable dependency-aware order: ready work is ordered by explicit order then id. */
export function orderParallelTasks(group: ParallelGroup): ParallelTask[] {
  const tasks = [...group.tasks];
  const done = new Set<string>();
  const result: ParallelTask[] = [];
  while (result.length < tasks.length) {
    const ready = tasks
      .filter((task) => !done.has(task.id) && (task.dependsOn ?? []).every((id) => done.has(id)))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
    if (!ready.length) {
      // Preserve all inputs even when a malformed/cyclic group is supplied.
      result.push(...tasks.filter((task) => !done.has(task.id)));
      break;
    }
    for (const task of ready) {
      done.add(task.id);
      result.push(task);
    }
  }
  return result;
}

export const orderParallelGroup = orderParallelTasks;

export function pendingParallelTasks(group: ParallelGroup): ParallelTask[] {
  return orderParallelTasks(group).filter((task) => task.status !== "DONE");
}
