/**
 * Tool: schedule_task
 *
 * Registers a recurring task. The task is persisted to a JSON file. A separate scheduler
 * process (or server feature) reads this file and triggers runs at the specified times.
 *
 * Configure SCHEDULED_TASKS_PATH (default: data/scheduled-tasks.json).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { ToolHandler } from '../security/sandboxed-tool-runner';

function resolveTasksPath(): string {
  const raw = process.env.SCHEDULED_TASKS_PATH ?? 'data/scheduled-tasks.json';
  const expanded = raw.replace(/^~/, homedir());
  return resolve(process.cwd(), expanded);
}

export interface ScheduledTaskEntry {
  id: string;
  schedule: string;
  goalTitle: string;
  goalDescription?: string;
  recipientEmail?: string;
  createdAt: number;
}

function loadTasks(path: string): ScheduledTaskEntry[] {
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTasks(path: string, tasks: ScheduledTaskEntry[]): void {
  const dir = resolve(path, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(tasks, null, 2), 'utf-8');
}

export const scheduleTask: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const schedule = input.schedule;
  if (typeof schedule !== 'string' || !schedule.trim()) {
    return { success: false, error: 'schedule is required (cron expression, e.g. "0 9 * * *" for 9am daily)' };
  }

  const cronExpr = schedule.trim().replace(/\s+/g, ' ');
  const parts = cronExpr.split(' ');
  if (parts.length !== 5) {
    return {
      success: false,
      error: 'schedule must be a 5-field cron expression: minute hour day-of-month month day-of-week (e.g. "0 9 * * *" for 9am daily)'
    };
  }

  const goalTitle = input.goalTitle ?? input.title ?? input.goal;
  if (typeof goalTitle !== 'string' || !goalTitle.trim()) {
    return { success: false, error: 'goalTitle (or title, goal) is required' };
  }

  const goalDescription = typeof input.goalDescription === 'string' ? input.goalDescription : undefined;
  const recipientEmail = typeof input.recipientEmail === 'string' && input.recipientEmail.trim()
    ? input.recipientEmail.trim()
    : undefined;

  const path = resolveTasksPath();
  const tasks = loadTasks(path);
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const entry: ScheduledTaskEntry = {
    id,
    schedule: cronExpr,
    goalTitle: goalTitle.trim(),
    goalDescription: goalDescription?.trim(),
    recipientEmail,
    createdAt: Date.now()
  };
  tasks.push(entry);
  saveTasks(path, tasks);

  return {
    success: true,
    id,
    message: `Scheduled "${goalTitle.trim()}" (${cronExpr}). A scheduler must be running to execute tasks.`
  };
};
