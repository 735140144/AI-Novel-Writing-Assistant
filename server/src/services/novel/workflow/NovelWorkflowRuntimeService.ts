import { isDirectorRecoveryNotNeededError } from "../director/novelDirectorErrors";
import { AUTO_DIRECTOR_HIGH_MEMORY_BATCH_LIMIT } from "../director/autoDirectorMemorySafety";
import type { NovelDirectorService } from "../director/NovelDirectorService";
import type { NovelWorkflowService } from "./NovelWorkflowService";

const SERVER_RESTART_RECOVERY_MESSAGE = "自动导演任务因服务重启中断，正在尝试恢复。";
const HIGH_MEMORY_STARTUP_RECOVERY_MESSAGE = "服务重启后检测到多个高内存自动导演任务，已暂停等待手动继续。";
const STALE_RUNNING_RECOVERY_MESSAGE = "自动导演任务长时间没有心跳，可能已因服务重启或内存不足中断。请检查后继续或重试。";

interface WorkflowRecoveryPort {
  listRecoverableAutoDirectorTasks(options?: { includeStaleRunningFlag?: boolean }): Promise<Array<{
    id: string;
    status: string;
    currentItemKey?: string | null;
    stale?: boolean;
  }>>;
  requeueTaskForRecovery(taskId: string, message: string): Promise<unknown>;
  restoreTaskToCheckpoint(taskId: string): Promise<unknown>;
  markTaskFailed(taskId: string, message: string): Promise<unknown>;
}

interface DirectorRecoveryPort {
  continueTask(taskId: string, input?: { batchAlreadyStartedCount?: number }): Promise<void>;
}

function createWorkflowService(): WorkflowRecoveryPort {
  const { NovelWorkflowService } = require("./NovelWorkflowService") as typeof import("./NovelWorkflowService");
  return new NovelWorkflowService();
}

function createDirectorService(): DirectorRecoveryPort {
  const { NovelDirectorService } = require("../director/NovelDirectorService") as typeof import("../director/NovelDirectorService");
  return new NovelDirectorService();
}

function isStartupHighMemoryDirectorItem(itemKey: string | null | undefined): boolean {
  return itemKey === "beat_sheet"
    || itemKey === "chapter_list"
    || itemKey === "chapter_detail_bundle"
    || itemKey === "chapter_sync"
    || itemKey === "chapter_execution"
    || itemKey === "quality_repair";
}

export class NovelWorkflowRuntimeService {
  constructor(
    private readonly workflowService: WorkflowRecoveryPort = createWorkflowService(),
    private readonly directorService: DirectorRecoveryPort = createDirectorService(),
  ) {}

  async resumePendingAutoDirectorTasks(): Promise<void> {
    const rows = await this.workflowService.listRecoverableAutoDirectorTasks();
    let highMemoryStartedCount = 0;
    for (const row of rows) {
      try {
        const isHighMemory = isStartupHighMemoryDirectorItem(row.currentItemKey);
        if (isHighMemory && highMemoryStartedCount >= AUTO_DIRECTOR_HIGH_MEMORY_BATCH_LIMIT) {
          await this.workflowService.requeueTaskForRecovery(row.id, HIGH_MEMORY_STARTUP_RECOVERY_MESSAGE);
          continue;
        }
        if (row.status === "running") {
          await this.workflowService.requeueTaskForRecovery(row.id, SERVER_RESTART_RECOVERY_MESSAGE);
        }
        await this.directorService.continueTask(row.id, isHighMemory
          ? { batchAlreadyStartedCount: highMemoryStartedCount }
          : undefined);
        if (isHighMemory) {
          highMemoryStartedCount += 1;
        }
      } catch (error) {
        if (isDirectorRecoveryNotNeededError(error)) {
          await this.workflowService.restoreTaskToCheckpoint(row.id);
          continue;
        }
        const message = error instanceof Error ? error.message : "自动导演任务在服务重启后恢复失败。";
        await this.workflowService.markTaskFailed(row.id, `服务重启后恢复失败：${message}`);
      }
    }
  }

  async markPendingAutoDirectorTasksForManualRecovery(options: {
    staleRunningAsFailed?: boolean;
  } = {}): Promise<void> {
    const rows = await this.workflowService.listRecoverableAutoDirectorTasks({
      includeStaleRunningFlag: options.staleRunningAsFailed === true,
    });
    for (const row of rows) {
      if (options.staleRunningAsFailed === true && row.stale) {
        await this.workflowService.markTaskFailed(row.id, STALE_RUNNING_RECOVERY_MESSAGE);
        continue;
      }
      await this.workflowService.requeueTaskForRecovery(row.id, "服务重启后任务已暂停，等待手动恢复。");
    }
  }
}
