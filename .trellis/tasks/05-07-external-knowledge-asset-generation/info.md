# 外部多模态文本引擎交互 Spec v1

Status: 已敲定
Date: 2026-05-07

## 0. 范围

本 spec 定义本项目与外部多模态文本引擎的 MVP 交互合同。

本期只覆盖：

* 单本小说绑定一个外部引擎来源。
* 首次生成整套书级资产草稿。
* 创作过程中按需新增人物、资产、线索和情节。
* 创作过程中按需获取节点级知识、约束、人物、资产、线索、情节和生命周期建议。
* 公共部分 + 基础部分的字段结构。
* 业务字段 + token 计费字段的分离。

本期不覆盖：

* 多来源合并。
* 复杂增量更新。
* 跨来源冲突仲裁。
* 本项目流程编排、章节归因判断、标记策略、删除执行和回退执行。
* 调用前报价。
* 字符数、请求次数、多模态单位或混合计费。

## 1. 设计结论

MVP 已确认：

* 单本小说绑定一个外部多模态文本引擎来源。
* 首次生成整套书级资产草稿。
* 人物、资产、线索、情节新增时，可以按需请求外部系统补充候选或校验。
* 外部系统只处理节点级调用，不理解也不参与本项目的创作流程编排。
* 世界观、文笔、故事线、约束等全局/书级能力不受章节节点影响；重取这些内容时，本项目直接使用 `nodeType: "global"` 或 `nodeType: "book"`。
* 人物、资产、线索、情节等章节相关能力，由本项目在请求时携带节点标识，外部系统只按标识生成候选。
* 线索失效、消耗类资产、重写回退、旧资产删除等生命周期变化，由外部系统返回建议，本项目自行判断并执行。
* 多来源合并、复杂增量更新、跨来源冲突仲裁放到后续阶段。

外部系统分为两层：

* 公共部分：所有能力共享的信封、身份、追踪、幂等、版本、错误、业务上下文和计费上下文。
* 基础部分：世界观、文笔类、故事线、人物资产、故事情节、AI 规范性约束和新增对象能力。

所有请求和响应字段分为两块：

* 业务字段：表达要生成什么、依据什么生成、返回什么候选、如何落成本项目资产。
* 计费字段：表达谁发起、按什么场景计费、预估/实际 token 用量、外部费用归因、如何对接本项目钱包和使用记录。

## 2. 系统职责边界

### 2.1 外部多模态文本引擎负责

* 根据本项目传入的小说上下文，生成结构化候选。
* 提供世界观、文笔、故事线、人物、情节、线索、约束等基础能力。
* 返回证据引用、覆盖范围、置信度、风险提示和冲突提示。
* 返回资产生命周期建议，例如失效、消耗、替换、删除、回退。
* 返回可用于账务归因的 usage / cost 信息。
* 不判断本项目流程，不决定章节归因，不执行本项目资产删除或回退。

### 2.2 本项目负责

* 绑定外部来源和记录 source snapshot。
* 发起生成任务、保存外部返回草稿、组织用户确认。
* 将确认结果应用为世界观、角色、写法、线索、故事线、情节等本地正式资产。
* 编排章节规划、写作、审校、修复、重规划等具体执行链路。
* 判断是否需要给外部请求携带章节、人物、线索或故事线节点标识。
* 判断外部返回的失效、消耗、删除、回退建议是否应用。
* 将外部调用写入本项目计费记录，并和现有套餐/钱包扣费体系对接。

## 3. 公共部分合同

公共部分建议所有请求都使用统一信封。

### 3.1 请求公共信封

```ts
interface ExternalEngineRequestEnvelope<TBusinessPayload> {
  common: ExternalEngineRequestCommon;
  business: TBusinessPayload;
  billing: ExternalEngineBillingRequest;
}
```

### 3.2 请求公共字段

```ts
interface ExternalEngineRequestCommon {
  requestId: string;
  idempotencyKey: string;
  tenantId: string;
  userId: string;
  novelId: string;
  sourceBindingId: string;
  sourceSnapshotId?: string | null;
  capability: ExternalEngineCapability;
  operation: ExternalEngineOperation;
  schemaVersion: string;
  locale: "zh-CN";
  createdAt: string;
  trace?: {
    taskId?: string | null;
    workflowId?: string | null;
    parentRequestId?: string | null;
  };
}
```

说明：

* `requestId` 用于追踪单次调用。
* `idempotencyKey` 用于重试去重。
* `sourceSnapshotId` 用于冻结上游资料版本。
* `capability` 表示调用世界观、文笔、故事线、人物、情节或约束能力。
* `operation` 表示节点级知识生成、候选生成、补全、校验、冲突检查或生命周期建议，不表达本项目内部流程状态。

### 3.3 业务上下文公共字段

```ts
interface ExternalEngineBusinessContext {
  novel: {
    title?: string | null;
    premise?: string | null;
    genre?: string | null;
    targetAudience?: string | null;
    bookFraming?: Record<string, unknown> | null;
  };
  existingAssets?: {
    worldIds?: string[];
    characterIds?: string[];
    styleProfileIds?: string[];
    clueIds?: string[];
    storylineIds?: string[];
  };
  nodeContext?: ExternalEngineNodeContext | null;
}

interface ExternalEngineNodeContext {
  nodeType: "global" | "book" | "volume" | "chapter" | "character" | "clue" | "storyline" | "task";
  nodeId?: string | null;
  volumeId?: string | null;
  chapterId?: string | null;
  characterId?: string | null;
  clueId?: string | null;
  storylineId?: string | null;
  relationTags?: string[] | null;
  note?: string | null;
}
```

说明：

* `nodeContext` 只用于告诉外部系统“本次围绕哪个知识节点生成”，不用于传递本项目内部流程状态。
* 世界观、文笔、故事线、约束这类全局/书级调用通常使用 `nodeType: "book"` 或 `nodeType: "global"`。
* 人物、资产、线索、情节这类章节相关调用，由本项目传入 `chapterId`、`characterId`、`clueId`、`storylineId` 等标识。
* `relationTags` 是本项目给外部系统的 opaque 标识，例如 `chapter_related`、`clue_consumable`、`rewrite_rollback_candidate`。外部系统只能返回建议，不能据此执行流程。
* 节点规则如下：
  * `global` / `book`：用于世界观、文笔、故事线、AI 约束这类不依赖章节流程的重取或生成。
  * `volume` / `chapter` / `character` / `clue` / `storyline` / `task`：用于章节相关、角色相关、线索相关、故事线相关的节点调用。
  * `relationTags` 只表示项目侧判断结果的提示，不是外部系统的流程开关。

### 3.4 请求计费字段

```ts
interface ExternalEngineBillingRequest {
  billingUserId: string;
  sourceType: "external_multimodal_text_engine";
  sourceId: string | null;
  taskType: string;
  pricingMode: "post_usage";
  estimate?: {
    promptTokens?: number | null;
    completionTokens?: number | null;
    cacheHitTokens?: number | null;
    totalTokens?: number | null;
    maxCost?: number | null;
    currency?: "CNY" | "USD" | "INTERNAL";
  };
  chargePolicy: {
    requirePrecheck: boolean;
    chargeOnFailure: boolean;
    chargeOnPartialResult: boolean;
  };
}
```

说明：

* 本项目已有 `BillingUsageRecord.sourceType/sourceId/taskType/provider/model/token/cost` 结构，外部引擎调用应能映射到同一类账本。
* MVP 计费单位固定为 token，外部引擎必须返回 prompt / completion / cache hit / total token。
* `pricingMode` 首期固定为 `post_usage`，按外部返回的实际 token 用量落账。
* `chargePolicy` 用于明确失败、部分成功、重试是否计费。

### 3.5 响应公共信封

```ts
interface ExternalEngineResponseEnvelope<TBusinessResult> {
  common: ExternalEngineResponseCommon;
  business: TBusinessResult;
  billing: ExternalEngineBillingResult;
}
```

### 3.6 响应公共字段

```ts
interface ExternalEngineResponseCommon {
  requestId: string;
  externalTaskId?: string | null;
  status: "succeeded" | "partial" | "failed" | "queued";
  schemaVersion: string;
  sourceSnapshotId?: string | null;
  completedAt?: string | null;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    detail?: Record<string, unknown>;
  } | null;
}
```

### 3.7 响应计费字段

```ts
interface ExternalEngineBillingResult {
  provider: string;
  model?: string | null;
  pricingUnit: "token";
  usage: {
    promptTokens: number;
    completionTokens: number;
    cacheHitTokens: number;
    totalTokens: number;
  };
  cost: {
    inputCost: number;
    outputCost: number;
    cacheHitCost: number;
    totalCost: number;
    currency: "CNY" | "USD" | "INTERNAL";
  };
  billable: boolean;
  chargeReason?: string | null;
}
```

说明：

* MVP 只接受 token 计费，不接字符数、请求次数或多模态单位计费。
* 外部系统即使内部使用其他计费口径，也必须在接口层折算并返回 token 口径和成本。
* 本项目落账时映射到现有 `BillingUsageRecord.promptTokens/completionTokens/cacheHitTokens/totalTokens` 与 `inputCost/outputCost/cacheHitCost/totalCost`。

## 4. 基础部分能力合同

### 4.1 能力枚举

```ts
type ExternalEngineCapability =
  | "world"
  | "prose_style"
  | "storyline"
  | "character_asset"
  | "plot"
  | "ai_constraint"
  | "new_object";

type ExternalEngineOperation =
  | "generate_book_assets"
  | "generate_node_knowledge"
  | "generate_candidates"
  | "complete_missing_fields"
  | "validate_consistency"
  | "detect_conflicts"
  | "suggest_lifecycle_updates";
```

### 4.2 统一业务结果字段

每个基础能力的业务结果都必须返回以下结构：

```ts
interface ExternalGeneratedDraftBase<TPayload> {
  draftId?: string | null;
  assetType: string;
  targetLevel: "book" | "volume" | "chapter" | "character" | "task";
  payload: TPayload;
  evidenceRefs: ExternalEvidenceRef[];
  confidence: number;
  coverage: ExternalCoverage;
  risks: ExternalRisk[];
  conflicts: ExternalConflict[];
  lifecycleSuggestions?: ExternalLifecycleSuggestion[];
  recommendedAction: "apply" | "review" | "ignore" | "regenerate";
}
```

```ts
interface ExternalLifecycleSuggestion {
  intent: "invalidate" | "consume" | "supersede" | "delete" | "rollback" | "restore";
  targetType: "world" | "character" | "style" | "storyline" | "plot" | "clue" | "asset" | "canon";
  targetId?: string | null;
  targetRef?: string | null;
  replacementRef?: string | null;
  consumedByRef?: string | null;
  reason: string;
  confidence: number;
}
```

说明：

* `lifecycleSuggestions` 只表示外部系统建议。
* 本项目必须自行判断是否应用建议。
* 外部系统不得直接要求本项目删除、回退或覆盖任何正式资产。
* 线索失效、资产消耗、章节重写、旧资产删除或恢复，都只在本项目确认后执行。

### 4.3 证据、覆盖、风险和冲突

```ts
interface ExternalEvidenceRef {
  sourceId: string;
  sourceSnapshotId?: string | null;
  documentId?: string | null;
  segmentId?: string | null;
  chapterRange?: string | null;
  quoteSummary: string;
  reason: string;
}

interface ExternalCoverage {
  label: string;
  scopeType: "full_book" | "chapter_range" | "sample_set" | "single_document" | "unknown";
  scopeDetail?: string | null;
}

interface ExternalRisk {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
  suggestion?: string | null;
}

interface ExternalConflict {
  targetType: "world" | "character" | "style" | "storyline" | "plot" | "clue" | "canon";
  targetId?: string | null;
  summary: string;
  resolutionHint: "keep_local" | "review_external" | "merge" | "replan";
}
```

## 5. MVP 能力清单

### 5.1 首次书级资产生成

一次请求可返回多个草稿：

* 世界观草稿。
* 文笔类草稿。
* 故事线草稿。
* 人物资产草稿。
* 故事情节草稿。
* AI 规范性约束草稿。

要求：

* 所有草稿必须带 `evidenceRefs`、`coverage`、`confidence`、`risks`。
* 草稿不能直接成为正式资产。
* 本项目根据 `recommendedAction` 组织确认界面和后续应用。

### 5.2 按需新增人物

业务输入：

* 当前小说目标。
* 已有人物和关系摘要。
* 新人物触发原因。
* 由本项目决定是否携带章节、卷、人物或故事线节点标识。

业务输出：

* 候选人物。
* 叙事岗位。
* 与已有角色关系。
* 欲望、弱点、口吻、红线。
* 可能引入的新线索和冲突。

### 5.3 按需新增资产

业务输入：

* 资产类型。
* 当前世界规则。
* 本项目传入的节点标识，例如章节、故事线、角色或全局节点。

业务输出：

* 世界要素、道具、组织、能力、场景或角色资源候选。
* 使用边界。
* 与现有世界/角色/情节的冲突提示。

### 5.4 按需新增线索

业务输入：

* 主线/支线状态。
* 已有线索。
* 本项目传入的章节、故事线或线索节点标识。

业务输出：

* 线索来源。
* 发现方式。
* 误导方式。
* 回收节点建议。
* 与主线/支线的因果关系。

### 5.5 按需新增情节

业务输入：

* 本项目传入的故事线、章节或任务节点标识。
* 已发生事件。
* 禁用方向。

业务输出：

* 情节候选。
* 事件因果。
* 冲突升级。
* 后续影响。
* 合理性校验和偏航风险。

### 5.6 按需获取全局知识与约束

业务输入：

* 当前小说目标。
* 需要获取的知识类型，例如世界观、文笔、故事线、AI 约束。
* `nodeType: "global"` 或 `nodeType: "book"`。

业务输出：

* 世界观、文笔、故事线或约束候选。
* 证据、覆盖范围、风险、冲突。
* 不包含章节流程判断。

### 5.7 生命周期建议

业务输入：

* 本项目传入的目标资产或线索标识。
* 本项目判断出的触发原因，例如重写、回退、线索已用、线索证伪、资产冲突。
* 必要的节点标识。

业务输出：

* `invalidate`：目标不再有效。
* `consume`：目标已被使用或消耗。
* `supersede`：目标应被新资产替换。
* `delete`：目标可删除。
* `rollback`：目标应随重写回退。
* `restore`：目标可从回退中恢复。

要求：

* 外部系统只返回建议和理由。
* 本项目根据本地状态、用户确认和 canonical state 自行执行。
* 如果是重新写章节或回退章节，本项目负责决定过去资产是否删除、归档、失效或恢复。

## 6. 本项目落地映射

### 6.1 草稿层

外部返回结果进入 `GeneratedBookAssetDraft` 类对象，记录：

* `assetType`
* `targetLevel`
* `draftPayload`
* `evidenceRefs`
* `coverage`
* `confidence`
* `risks`
* `conflicts`
* `reviewStatus`
* `appliedAssetId`

### 6.2 正式资产层

用户或系统确认后，草稿才应用为本项目正式资产：

* 世界观资产。
* 写法/文笔资产。
* 故事线/宏观规划资产。
* 人物资产。
* 情节/线索资产。
* AI 规范性约束资产。

### 6.3 计费映射

外部调用应写入本项目账务来源：

* `sourceType`: `external_multimodal_text_engine`
* `sourceId`: 外部请求 ID 或本项目任务 ID
* `taskType`: `external_engine.<capability>.<operation>`
* `provider`: 外部引擎供应商
* `model`: 外部返回模型名；无模型名时使用外部能力名
* `totalCost`: 外部返回或本项目根据价格规则计算
* `lifecycleSuggestions`: 外部返回的失效、消耗、替换、删除、回退或恢复建议

MVP 计费策略建议：

* 调用前做本项目余额/套餐可用性检查。
* 调用后按外部返回的实际 token 用量与 `billing.cost.totalCost` 落账。
* 外部失败且 `billable=false` 不扣费。
* 外部返回 `partial` 时根据 `chargePolicy.chargeOnPartialResult` 决定是否扣费。
* 外部返回生命周期建议不代表本项目已经执行生命周期变更。
* 外部返回的生命周期建议只影响本项目的后续决策，不直接改写本地资产状态。

## 7. 已确认与待扩展

已确认：

* MVP 按 token 计费。
* MVP 按调用后实际用量落账。
* 外部系统必须返回 prompt / completion / cache hit / total token 与对应成本。
* 外部系统只处理节点级调用，不判断本项目流程。
* 全局/书级能力不受章节节点影响；章节相关能力由本项目携带节点标识。
* 生命周期变更只由外部系统返回建议，本项目自行判断和执行。

后续扩展：

* 调用前报价可以在上游稳定后再扩展。
* 字符数、请求次数、多模态单位、混合计费不进入 MVP。
