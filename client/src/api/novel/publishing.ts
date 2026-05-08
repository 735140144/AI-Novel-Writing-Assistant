import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CreatePublishingCredentialRequest,
  GeneratePublishPlanRequest,
  NovelPlatformBinding,
  PublishDispatchJob,
  PublishPlan,
  PublishingCredentialLoginResponse,
  PublishingPlatformCredential,
  PublishingWorkspaceResponse,
  SubmitPublishPlanRequest,
  UpsertNovelPlatformBindingRequest,
} from "@ai-novel/shared/types/publishing";
import { apiClient } from "../client";

export async function getPublishingWorkspace(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<PublishingWorkspaceResponse>>(
    `/novels/${novelId}/publishing/workspace`,
  );
  return data;
}

export async function createPublishingCredential(payload: CreatePublishingCredentialRequest) {
  const { data } = await apiClient.post<ApiResponse<PublishingPlatformCredential>>(
    "/novels/publishing/credentials",
    payload,
  );
  return data;
}

export async function bootstrapPublishingCredentialLogin(
  credentialId: string,
  payload: { mode?: "create" | "refresh" } = {},
) {
  const { data } = await apiClient.post<ApiResponse<PublishingCredentialLoginResponse>>(
    `/novels/publishing/credentials/${credentialId}/login-bootstrap`,
    payload,
  );
  return data;
}

export async function validatePublishingCredential(credentialId: string, payload: { challengeId?: string } = {}) {
  const { data } = await apiClient.post<ApiResponse<PublishingCredentialLoginResponse>>(
    `/novels/publishing/credentials/${credentialId}/validate`,
    payload,
  );
  return data;
}

export async function upsertNovelPlatformBinding(novelId: string, payload: UpsertNovelPlatformBindingRequest) {
  const { data } = await apiClient.put<ApiResponse<NovelPlatformBinding>>(
    `/novels/${novelId}/publishing/binding`,
    payload,
  );
  return data;
}

export async function generatePublishPlan(novelId: string, payload: GeneratePublishPlanRequest) {
  const { data } = await apiClient.post<ApiResponse<PublishPlan>>(
    `/novels/${novelId}/publishing/plans`,
    payload,
  );
  return data;
}

export async function submitPublishPlan(novelId: string, planId: string, payload: SubmitPublishPlanRequest = {}) {
  const { data } = await apiClient.post<ApiResponse<PublishDispatchJob[]>>(
    `/novels/${novelId}/publishing/plans/${planId}/submit`,
    payload,
  );
  return data;
}

export async function refreshPublishJob(novelId: string, jobId: string) {
  const { data } = await apiClient.post<ApiResponse<PublishDispatchJob>>(
    `/novels/${novelId}/publishing/jobs/${jobId}/refresh`,
    {},
  );
  return data;
}
