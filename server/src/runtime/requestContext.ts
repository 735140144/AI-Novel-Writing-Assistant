import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContextValue {
  userId?: string;
  authMode?: "session" | "dev_bypass";
  billingBypass?: boolean;
}

const requestContextStore = new AsyncLocalStorage<RequestContextValue>();

export function runWithRequestContext<T>(
  value: RequestContextValue,
  runner: () => T,
): T {
  return requestContextStore.run(value, runner);
}

export function getRequestContext(): RequestContextValue | undefined {
  return requestContextStore.getStore();
}
