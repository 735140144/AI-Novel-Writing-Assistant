import { PublishItemStatus } from "@prisma/client";

export function shouldSubmitPlanItem(input: {
  status: PublishItemStatus | "unpublished" | "submitting" | "draft_box" | "published" | "failed" | "relogin_required";
}): boolean {
  return (
    input.status === PublishItemStatus.unpublished
    || input.status === PublishItemStatus.failed
    || input.status === PublishItemStatus.relogin_required
  );
}
