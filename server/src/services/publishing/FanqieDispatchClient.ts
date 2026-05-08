import { z } from "zod";
import type {
  PublishDispatchJobStatus,
  PublishMode,
} from "@ai-novel/shared/types/publishing";

const DEFAULT_DISPATCH_BASE_URL = "https://dispatch.lucky37.cn";

const credentialSchema = z.object({
  uuid: z.string(),
  label: z.string().optional(),
  status: z.enum(["created", "login_pending", "ready", "expired", "invalid"]),
  lastValidatedAt: z.string().optional(),
  account: z.object({
    accountId: z.string().optional(),
    accountDisplayName: z.string().optional(),
  }).optional(),
});

const challengeSchema = z.object({
  id: z.string().optional(),
  mode: z.string().optional(),
  provider: z.string().optional(),
  status: z.string().optional(),
  providerStatus: z.string().optional(),
  verificationUrl: z.string().optional(),
  qrPayload: z.string().optional(),
  qrCodeBase64Png: z.string().optional(),
  qrTerminal: z.string().optional(),
  qrCompactPayload: z.string().optional(),
  qrCompactTerminal: z.string().optional(),
  qrPageUrl: z.string().optional(),
  qrImageUrl: z.string().optional(),
  expiresAt: z.string().optional(),
}).passthrough();

const credentialResponseSchema = z.object({
  credential: credentialSchema.passthrough(),
});

const loginBootstrapResponseSchema = z.object({
  credential: credentialSchema.passthrough(),
  challenge: challengeSchema.optional(),
});

const validateCredentialResponseSchema = z.object({
  credential: credentialSchema.passthrough(),
  validation: z.object({
    status: z.enum(["created", "login_pending", "ready", "expired", "invalid"]).optional(),
    ready: z.boolean().optional(),
  }).optional(),
  challenge: challengeSchema.optional(),
});

const dispatchJobSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "leased", "running", "completed", "failed"]),
  mode: z.enum(["draft", "publish"]).optional(),
  chapterCount: z.number().int().optional(),
  result: z.unknown().optional(),
  lastError: z.unknown().optional(),
}).passthrough();

const publishJobResponseSchema = z.object({
  job: dispatchJobSchema,
});

const progressChapterRowSchema = z.object({
  source: z.string(),
  order: z.number().int().optional(),
  title: z.string(),
  chapterName: z.string(),
  itemId: z.string().optional(),
}).passthrough();

const bookProgressResponseSchema = z.object({
  progress: z.object({
    bookId: z.string(),
    bookTitle: z.string(),
    publishedChapters: z.array(progressChapterRowSchema),
    draftChapters: z.array(progressChapterRowSchema),
    effectiveDraftChapters: z.array(progressChapterRowSchema),
  }),
});

const dispatchErrorSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
    detail: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  relogin: z.object({
    action: z.string().optional(),
    credentialUuid: z.string().optional(),
  }).optional(),
}).passthrough();

export interface FanqieDispatchCredential {
  uuid: string;
  status: "created" | "login_pending" | "ready" | "expired" | "invalid";
  label?: string;
  lastValidatedAt?: string;
  account?: {
    accountId?: string;
    accountDisplayName?: string;
  };
}

export interface FanqieDispatchChallenge {
  id?: string;
  mode?: string;
  provider?: string;
  status?: string;
  providerStatus?: string;
  verificationUrl?: string;
  qrPayload?: string;
  qrCodeBase64Png?: string;
  qrTerminal?: string;
  qrCompactPayload?: string;
  qrCompactTerminal?: string;
  qrPageUrl?: string;
  qrImageUrl?: string;
  expiresAt?: string;
}

export interface FanqieDispatchJob {
  id: string;
  status: PublishDispatchJobStatus;
  mode?: PublishMode;
  chapterCount?: number;
  result?: unknown;
  lastError?: unknown;
}

export interface FanqieDispatchPublishChapter {
  order: number;
  title: string;
  volumeTitle?: string | null;
  content: string;
}

export interface FanqieDispatchProgressChapterRow {
  source: string;
  order?: number;
  title: string;
  chapterName: string;
  itemId?: string;
}

export interface FanqieDispatchBookProgress {
  bookId: string;
  bookTitle: string;
  publishedChapters: FanqieDispatchProgressChapterRow[];
  draftChapters: FanqieDispatchProgressChapterRow[];
  effectiveDraftChapters: FanqieDispatchProgressChapterRow[];
}

export class FanqieDispatchApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "FanqieDispatchApiError";
    this.status = status;
    this.payload = payload;
  }
}

function getDispatchBaseUrl(): string {
  return (process.env.FANQIE_DISPATCH_BASE_URL ?? DEFAULT_DISPATCH_BASE_URL).replace(/\/+$/, "");
}

function getDispatchTimeoutMs(): number {
  const parsed = Number(process.env.FANQIE_DISPATCH_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

async function parseResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function resolveDispatchErrorMessage(payload: unknown, fallback: string): string {
  const parsed = dispatchErrorSchema.safeParse(payload);
  const message = parsed.success ? parsed.data.error?.message : null;
  return message?.trim() || fallback;
}

export class FanqieDispatchClient {
  constructor(
    private readonly baseUrl = getDispatchBaseUrl(),
    private readonly timeoutMs = getDispatchTimeoutMs(),
  ) {}

  private async request<T>(input: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    schema: z.ZodType<T>;
  }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${input.path}`, {
        method: input.method,
        headers: input.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: controller.signal,
      });
      const payload = await parseResponseJson(response);
      if (!response.ok) {
        throw new FanqieDispatchApiError(
          resolveDispatchErrorMessage(payload, "发布平台服务请求失败。"),
          response.status,
          payload,
        );
      }
      return input.schema.parse(payload);
    } catch (error) {
      if (error instanceof FanqieDispatchApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new FanqieDispatchApiError("发布平台服务请求超时。", 504, null);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async createCredential(label: string): Promise<FanqieDispatchCredential> {
    const response = await this.request({
      method: "POST",
      path: "/credentials",
      body: { label },
      schema: credentialResponseSchema,
    });
    return response.credential;
  }

  async getCredential(credentialUuid: string): Promise<FanqieDispatchCredential> {
    const response = await this.request({
      method: "GET",
      path: `/credentials/${encodeURIComponent(credentialUuid)}`,
      schema: credentialResponseSchema,
    });
    return response.credential;
  }

  async bootstrapLogin(input: {
    credentialUuid: string;
    mode?: "create" | "refresh";
  }): Promise<{
    credential: FanqieDispatchCredential;
    challenge: FanqieDispatchChallenge | null;
  }> {
    const response = await this.request({
      method: "POST",
      path: `/credentials/${encodeURIComponent(input.credentialUuid)}/login-bootstrap`,
      body: { mode: input.mode ?? "create" },
      schema: loginBootstrapResponseSchema,
    });
    return {
      credential: response.credential,
      challenge: response.challenge ?? null,
    };
  }

  async validateCredential(input: {
    credentialUuid: string;
    challengeId?: string;
  }): Promise<{
    credential: FanqieDispatchCredential;
    challenge: FanqieDispatchChallenge | null;
  }> {
    const response = await this.request({
      method: "POST",
      path: `/credentials/${encodeURIComponent(input.credentialUuid)}/validate`,
      body: input.challengeId ? { challengeId: input.challengeId } : {},
      schema: validateCredentialResponseSchema,
    });
    return {
      credential: response.credential,
      challenge: response.challenge ?? null,
    };
  }

  async createPublishJob(input: {
    credentialUuid: string;
    bookId: string;
    bookTitle: string;
    mode: PublishMode;
    requestId: string;
    publishOptions: {
      useAi?: boolean;
      timerTime: string;
      dailyWordLimit?: number;
    };
    chapters: FanqieDispatchPublishChapter[];
  }): Promise<FanqieDispatchJob> {
    const response = await this.request({
      method: "POST",
      path: "/publish/jobs",
      body: input,
      schema: publishJobResponseSchema,
    });
    return response.job;
  }

  async getJob(jobId: string): Promise<FanqieDispatchJob> {
    const response = await this.request({
      method: "GET",
      path: `/jobs/${encodeURIComponent(jobId)}`,
      schema: publishJobResponseSchema,
    });
    return response.job;
  }

  async getBookProgress(input: {
    credentialUuid: string;
    bookId: string;
    bookTitle: string;
  }): Promise<FanqieDispatchBookProgress> {
    const search = new URLSearchParams({
      bookId: input.bookId,
      bookTitle: input.bookTitle,
    });
    const response = await this.request({
      method: "GET",
      path: `/credentials/${encodeURIComponent(input.credentialUuid)}/books/progress?${search.toString()}`,
      schema: bookProgressResponseSchema,
    });
    return response.progress;
  }
}
