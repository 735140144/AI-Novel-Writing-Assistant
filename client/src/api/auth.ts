import type { ApiResponse } from "@ai-novel/shared/types/api";
import { apiClient } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  status: string;
  emailVerifiedAt: string | null;
}

export async function getCurrentAuthUser() {
  const { data } = await apiClient.get<ApiResponse<AuthUser>>("/auth/me");
  return data;
}

export async function registerWithEmail(payload: { email: string; password: string }) {
  const { data } = await apiClient.post<ApiResponse<AuthUser>>("/auth/register", payload);
  return data;
}

export async function loginWithEmail(payload: { email: string; password: string }) {
  const { data } = await apiClient.post<ApiResponse<AuthUser>>("/auth/login", payload);
  return data;
}

export async function logoutCurrentAuthUser() {
  const { data } = await apiClient.post<ApiResponse<null>>("/auth/logout");
  return data;
}

export async function requestPasswordReset(payload: { email: string }) {
  const { data } = await apiClient.post<ApiResponse<null>>("/auth/forgot-password", payload);
  return data;
}

export async function resetPasswordWithToken(payload: { token: string; password: string }) {
  const { data } = await apiClient.post<ApiResponse<null>>("/auth/reset-password", payload);
  return data;
}
