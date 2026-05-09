import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CreatePublishingCredentialRequest,
  DeletePublishPlanResponse,
  GeneratePublishPlanRequest,
  NovelPlatformBinding,
  PublishDispatchJob,
  PublishPlan,
  PublishingAccountWorkspaceResponse,
  PublishingBindingRemoteProgress,
  PublishingCredentialLoginResponse,
  PublishingPlatformCredential,
  PublishingWorkDetailResponse,
  PublishingWorksResponse,
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

export async function getPublishingAccounts() {
  const { data } = await apiClient.get<ApiResponse<PublishingAccountWorkspaceResponse>>(
    "/novels/publishing/credentials",
  );
  return data;
}

export async function getPublishingWorks() {
  const { data } = await apiClient.get<ApiResponse<PublishingWorksResponse>>(
    "/novels/publishing/works",
  );
  return data;
}

export async function getPublishingWorkDetail(bindingId: string) {
  const { data } = await apiClient.get<ApiResponse<PublishingWorkDetailResponse>>(
    `/novels/publishing/works/${bindingId}`,
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

export async function createNovelPlatformBinding(novelId: string, payload: UpsertNovelPlatformBindingRequest) {
  const { data } = await apiClient.post<ApiResponse<NovelPlatformBinding>>(
    `/novels/${novelId}/publishing/bindings`,
    payload,
  );
  return data;
}

export async function syncPublishingBindingProgress(bindingId: string) {
  const { data } = await apiClient.post<ApiResponse<PublishingBindingRemoteProgress>>(
    `/novels/publishing/works/${bindingId}/progress/sync`,
    {},
  );
  return data;
}

export async function generatePublishingPlan(bindingId: string, payload: GeneratePublishPlanRequest) {
  const { data } = await apiClient.post<ApiResponse<PublishPlan>>(
    `/novels/publishing/works/${bindingId}/plans`,
    payload,
  );
  return data;
}

export async function submitPublishingPlan(bindingId: string, planId: string, payload: SubmitPublishPlanRequest = {}) {
  const { data } = await apiClient.post<ApiResponse<PublishDispatchJob[]>>(
    `/novels/publishing/works/${bindingId}/plans/${planId}/submit`,
    payload,
  );
  return data;
}

export async function deletePublishingPlan(bindingId: string, planId: string) {
  const { data } = await apiClient.delete<ApiResponse<DeletePublishPlanResponse>>(
    `/novels/publishing/works/${bindingId}/plans/${planId}`,
  );
  return data;
}

export async function refreshPublishingJob(bindingId: string, jobId: string) {
  const { data } = await apiClient.post<ApiResponse<PublishDispatchJob>>(
    `/novels/publishing/works/${bindingId}/jobs/${jobId}/refresh`,
    {},
  );
  return data;
}
