import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  PublishItemStatus,
  PublishMode,
  PublishingLoginChallenge,
} from "@ai-novel/shared/types/publishing";
import {
  bootstrapPublishingCredentialLogin,
  createPublishingCredential,
  generatePublishPlan,
  getPublishingWorkspace,
  refreshPublishJob,
  submitPublishPlan,
  upsertNovelPlatformBinding,
  validatePublishingCredential,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import type { PublishingTabViewProps } from "../components/NovelEditView.types";

interface UseNovelPublishingWorkspaceInput {
  novelId: string;
  llm: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  };
  queryClient: QueryClient;
}

const publishItemStatusLabels: Record<PublishItemStatus, string> = {
  unpublished: "未发布",
  submitting: "提交中",
  draft_box: "草稿箱",
  published: "已发布",
  failed: "失败",
  relogin_required: "需要重新扫码",
};

function readPublishingLoginChallenge(value: unknown): PublishingLoginChallenge | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as PublishingLoginChallenge;
}

export function useNovelPublishingWorkspace(input: UseNovelPublishingWorkspaceInput): {
  tab: PublishingTabViewProps;
} {
  const { novelId, llm, queryClient } = input;
  const [message, setMessage] = useState("");
  const [accountLabel, setAccountLabel] = useState("番茄作者号");
  const [credentialId, setCredentialId] = useState("");
  const [bookId, setBookId] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [scheduleInstruction, setScheduleInstruction] = useState("每日 8 点发布 2 章节");
  const [mode, setMode] = useState<PublishMode>("draft");
  const [loginChallenge, setLoginChallenge] = useState<PublishingLoginChallenge | null>(null);
  const workspaceSyncSignatureRef = useRef("");

  const workspaceQuery = useQuery({
    queryKey: queryKeys.novels.publishingWorkspace(novelId),
    queryFn: () => getPublishingWorkspace(novelId),
    enabled: Boolean(novelId),
  });

  const invalidateWorkspace = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.publishingWorkspace(novelId) });
  };

  const createCredentialMutation = useMutation({
    mutationFn: () => createPublishingCredential({
      platform: "fanqie",
      label: accountLabel.trim() || "番茄作者号",
    }),
    onSuccess: async (response) => {
      const credential = response.data;
      if (credential?.id) {
        setCredentialId(credential.id);
        setMessage("请扫码登录番茄。");
        await invalidateWorkspace();
      }
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "发布账号创建失败。");
    },
  });

  const bootstrapLoginMutation = useMutation({
    mutationFn: (payload: { credentialId: string; mode?: "create" | "refresh" }) =>
      bootstrapPublishingCredentialLogin(payload.credentialId, { mode: payload.mode }),
    onSuccess: async (response) => {
      setLoginChallenge(response.data?.challenge ?? null);
      setMessage("请用番茄作者账号扫码。");
      await invalidateWorkspace();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "扫码入口生成失败。");
    },
  });

  const validateCredentialMutation = useMutation({
    mutationFn: (nextCredentialId: string) => validatePublishingCredential(nextCredentialId),
    onSuccess: async (response) => {
      const status = response.data?.credential.status;
      setLoginChallenge(response.data?.challenge ?? loginChallenge);
      setMessage(status === "ready" ? "番茄账号可用于发布。" : "账号状态刷新完成，请按状态继续处理。");
      await invalidateWorkspace();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "账号状态刷新失败。");
    },
  });

  const saveBindingMutation = useMutation({
    mutationFn: () => upsertNovelPlatformBinding(novelId, {
      platform: "fanqie",
      credentialId,
      bookId,
      bookTitle,
    }),
    onSuccess: async () => {
      setMessage("番茄书籍绑定可用于生成发布时间表。");
      await invalidateWorkspace();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "书籍绑定失败。");
    },
  });

  const generatePlanMutation = useMutation({
    mutationFn: () => generatePublishPlan(novelId, {
      bindingId: workspaceQuery.data?.data?.binding?.id,
      instruction: scheduleInstruction,
      mode,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async () => {
      setMessage("发布时间表可用于提交章节。");
      await invalidateWorkspace();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "发布时间表生成失败。");
    },
  });

  const submitPlanMutation = useMutation({
    mutationFn: (submitMode: PublishMode) => {
      const planId = workspaceQuery.data?.data?.activePlan?.id;
      if (!planId) {
        throw new Error("请先生成发布时间表。");
      }
      return submitPublishPlan(novelId, planId, { mode: submitMode });
    },
    onSuccess: async (_response, submitMode) => {
      setMessage(submitMode === "publish" ? "章节正在提交发布平台。" : "章节正在提交到草稿箱。");
      await invalidateWorkspace();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "章节提交失败。");
    },
  });

  const refreshJobMutation = useMutation({
    mutationFn: (jobId: string) => refreshPublishJob(novelId, jobId),
    onSuccess: async () => {
      setMessage("发布任务状态刷新完成。");
      await invalidateWorkspace();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "发布任务状态刷新失败。");
    },
  });

  useEffect(() => {
    const workspace = workspaceQuery.data?.data;
    if (!workspace) {
      return;
    }
    const binding = workspace.binding;
    const firstCredential = workspace.credentials[0] ?? null;
    const selectedCredential = binding
      ? workspace.credentials.find((credential) => credential.id === binding.credentialId) ?? firstCredential
      : firstCredential;
    const latestChallenge = selectedCredential
      ? readPublishingLoginChallenge(selectedCredential.lastLoginChallengeJson)
      : null;
    const nextSignature = [
      binding?.id ?? "",
      binding?.credentialId ?? "",
      binding?.bookId ?? "",
      binding?.bookTitle ?? "",
      selectedCredential?.id ?? "",
      selectedCredential?.label ?? "",
      selectedCredential?.lastLoginChallengeId ?? "",
      selectedCredential?.updatedAt ?? "",
    ].join("|");
    if (workspaceSyncSignatureRef.current === nextSignature) {
      return;
    }
    workspaceSyncSignatureRef.current = nextSignature;

    if (selectedCredential) {
      setCredentialId(selectedCredential.id);
      setAccountLabel(selectedCredential.label || "番茄作者号");
    }
    if (binding) {
      setBookId(binding.bookId);
      setBookTitle(binding.bookTitle);
    }
    setLoginChallenge(latestChallenge);
  }, [workspaceQuery.data?.data]);

  const handleSelectedCredentialIdChange = (nextCredentialId: string) => {
    setCredentialId(nextCredentialId);
    const selectedCredential = workspaceQuery.data?.data?.credentials.find((credential) => credential.id === nextCredentialId);
    setLoginChallenge(selectedCredential ? readPublishingLoginChallenge(selectedCredential.lastLoginChallengeJson) : null);
    if (selectedCredential?.label) {
      setAccountLabel(selectedCredential.label);
    }
  };

  const workspace = workspaceQuery.data?.data;

  return {
    tab: {
      novelId,
      credentials: workspace?.credentials ?? [],
      binding: workspace?.binding ?? null,
      activePlan: workspace?.activePlan ?? null,
      recentJobs: workspace?.recentJobs ?? [],
      isLoading: workspaceQuery.isLoading || workspaceQuery.isFetching,
      accountLabel,
      onAccountLabelChange: setAccountLabel,
      selectedCredentialId: credentialId,
      onSelectedCredentialIdChange: handleSelectedCredentialIdChange,
      bookId,
      onBookIdChange: setBookId,
      bookTitle,
      onBookTitleChange: setBookTitle,
      scheduleInstruction,
      onScheduleInstructionChange: setScheduleInstruction,
      selectedMode: mode,
      onSelectedModeChange: setMode,
      latestChallenge: loginChallenge,
      onCreateCredential: () => createCredentialMutation.mutate(),
      isCreatingCredential: createCredentialMutation.isPending,
      onBootstrapLogin: (nextCredentialId, loginMode) => bootstrapLoginMutation.mutate({
        credentialId: nextCredentialId,
        mode: loginMode,
      }),
      bootstrappingCredentialId: bootstrapLoginMutation.isPending
        ? bootstrapLoginMutation.variables?.credentialId ?? ""
        : "",
      onValidateCredential: (nextCredentialId) => validateCredentialMutation.mutate(nextCredentialId),
      validatingCredentialId: validateCredentialMutation.isPending
        ? validateCredentialMutation.variables ?? ""
        : "",
      onSaveBinding: () => saveBindingMutation.mutate(),
      isSavingBinding: saveBindingMutation.isPending,
      onGeneratePlan: () => generatePlanMutation.mutate(),
      isGeneratingPlan: generatePlanMutation.isPending,
      onSubmitPlan: (submitMode) => submitPlanMutation.mutate(submitMode),
      submittingMode: submitPlanMutation.isPending
        ? submitPlanMutation.variables ?? mode
        : null,
      onRefreshJob: (jobId) => refreshJobMutation.mutate(jobId),
      refreshingJobId: refreshJobMutation.isPending
        ? refreshJobMutation.variables ?? ""
        : "",
      statusLabels: publishItemStatusLabels,
      message,
    },
  };
}
