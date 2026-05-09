import { PublishDispatchJobStatus, PublishItemStatus } from "@prisma/client";

type PlanDeletionItemEvidence = {
  status: PublishItemStatus | "unpublished" | "submitting" | "draft_box" | "published" | "failed" | "relogin_required";
  dispatchJobId?: string | null;
  externalJobId?: string | null;
  submittedAt?: Date | string | null;
  dispatchStatus?: PublishDispatchJobStatus | "queued" | "leased" | "running" | "completed" | "failed" | null;
};

type PlanDeletionJobEvidence = {
  status: PublishDispatchJobStatus | "queued" | "leased" | "running" | "completed" | "failed";
  externalJobId?: string | null;
  submittedAt?: Date | string | null;
};

export function hasPlanSubmissionEvidence(item: PlanDeletionItemEvidence): boolean {
  if (item.status === PublishItemStatus.submitting) {
    return true;
  }

  if (item.status !== PublishItemStatus.draft_box && item.status !== PublishItemStatus.published) {
    return false;
  }

  return Boolean(
    item.dispatchJobId
    || item.externalJobId
    || item.submittedAt
    || item.dispatchStatus,
  );
}

export function hasBlockingPlanSubmissionEvidence(input: {
  items: PlanDeletionItemEvidence[];
  jobs: PlanDeletionJobEvidence[];
}): boolean {
  const hasCommittedItems = input.items.some((item) => hasPlanSubmissionEvidence(item));
  if (hasCommittedItems) {
    return true;
  }

  return input.jobs.some((job) =>
    job.status === PublishDispatchJobStatus.running
    || job.status === PublishDispatchJobStatus.leased
    || job.status === PublishDispatchJobStatus.completed
    || Boolean(job.externalJobId)
  );
}
