import { isImmediatePublishTime } from "./publishingSchedule";

export function buildPublishOptions(input: {
  plannedPublishTime: string;
  useAi?: boolean;
  dailyWordLimit?: number;
}) {
  return {
    ...(typeof input.useAi === "boolean" ? { useAi: input.useAi } : {}),
    ...(!isImmediatePublishTime(input.plannedPublishTime) ? { timerTime: input.plannedPublishTime } : {}),
    ...(typeof input.dailyWordLimit === "number" ? { dailyWordLimit: input.dailyWordLimit } : {}),
  };
}
