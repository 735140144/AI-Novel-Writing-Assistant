import type { Response } from "express";

interface StreamJsonWithKeepaliveInput<T> {
  res: Response;
  promise: Promise<T>;
  writeSuccess: (value: T, options: { chunked: boolean }) => void;
  next: (error?: unknown) => void;
  initialDelayMs?: number;
  intervalMs?: number;
}

function parseDelayMs(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

export async function streamJsonWithKeepalive<T>(input: StreamJsonWithKeepaliveInput<T>): Promise<void> {
  const {
    res,
    promise,
    writeSuccess,
    next,
    initialDelayMs = parseDelayMs(process.env.JSON_KEEPALIVE_INITIAL_DELAY_MS, 15_000),
    intervalMs = parseDelayMs(process.env.JSON_KEEPALIVE_INTERVAL_MS, 15_000),
  } = input;

  let heartbeatTimer: NodeJS.Timeout | null = null;
  let heartbeatStarted = false;
  const heartbeatChunk = " ".repeat(2048);

  const clearHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const startHeartbeat = () => {
    if (heartbeatStarted || res.headersSent) {
      return;
    }
    heartbeatStarted = true;
    res.status(200);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Transfer-Encoding", "chunked");
    res.flushHeaders?.();
    res.write(heartbeatChunk);
    heartbeatTimer = setInterval(() => {
      if (!res.writableEnded) {
        res.write(heartbeatChunk);
      }
    }, intervalMs);
    heartbeatTimer.unref?.();
  };

  const initialTimer = setTimeout(startHeartbeat, initialDelayMs);
  initialTimer.unref?.();

  try {
    const value = await promise;
    clearTimeout(initialTimer);
    clearHeartbeat();

    if (heartbeatStarted) {
      writeSuccess(value, { chunked: true });
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    writeSuccess(value, { chunked: false });
  } catch (error) {
    clearTimeout(initialTimer);
    clearHeartbeat();

    if (heartbeatStarted) {
      if (!res.destroyed) {
        res.destroy(error instanceof Error ? error : undefined);
      }
      return;
    }

    next(error);
  }
}
