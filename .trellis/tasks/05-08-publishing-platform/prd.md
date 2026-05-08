# 新增发布平台

## Goal

为小说新增发布平台能力，让用户可以把本项目中的小说绑定到外部小说平台账号和平台书籍，按发布计划把章节提交到指定平台，并在本项目内看到每章从未发布、草稿箱到已发布的状态。

这条能力服务于新手完整成书后的发布闭环：用户不需要自己维护发布时间表、逐章复制正文、判断哪些章节已经提交。系统应提供清晰默认值、自动生成计划、状态追踪和失败恢复入口。

## What I Already Know

* 用户希望新建独立 Trellis task。
* 目标功能包括：绑定小说平台、将小说发布到指定小说平台、生成发布计划、调用发布接口时带入发布时间、展示发布状态。
* 示例节奏是“每日 8 点发布 2 章节”，系统需要据此生成每章发布时间。
* 用户要求状态至少包含：未提交到平台时为未发布，提交到平台草稿箱时为草稿箱，已发布时为已发布。
* 外部发布接口参考 `/tmp/gelsangdispatch-release/docs/api.md`。
* 参考 API 当前是 Fanqie Draft Publisher API，base URL 为 `https://dispatch.lucky37.cn`。
* 参考 API 支持创建凭据、二维码登录、校验凭据、提交草稿/发布任务、查询 job、查询 audit。
* 参考 API 没有业务级鉴权，应由本项目服务端封装调用，不能让前端直接访问外部服务。
* 参考 API 使用 `credentialUuid` 选择番茄凭据，`bookId` / `bookTitle` 指定平台书籍。
* 参考 API `POST /publish/jobs` 的 `mode` 为 `draft` 或 `publish`。
* 用户已确认发布接口支持 `YYYY-MM-DD HH:mm` 格式的发布时间。
* 参考 API job 状态为 `queued`、`leased`、`running`、`completed`、`failed`。
* 参考 API 凭据状态为 `created`、`login_pending`、`ready`、`expired`、`invalid`。
* 本项目已有小说、章节、用户归属、章节管理、导出和任务中心基础。
* 现有 `Novel` 与 `Chapter` 已按 `userId` / `novelId` 建立归属关系；新增发布平台数据也应保持用户与小说隔离。

## Assumptions

* MVP 先接入番茄平台，平台能力用通用发布平台模型承载，后续可以扩展其他平台。
* 平台账号绑定与本项目用户绑定，平台书籍绑定与本项目小说绑定。
* 外部 `bookId` 初期由用户填写或粘贴，除非后续 dispatch API 提供书籍列表接口。
* 发布计划由本项目保存为本地事实源；外部发布服务只执行提交任务并返回执行状态。
* 用户输入自然语言发布节奏时，使用 AI 结构化理解生成计划参数，再由确定性逻辑计算每章发布时间；不能用关键词/正则分支作为产品核心解析路径。
* 外部服务不保存章节正文，但本项目本来已保存章节正文；本项目的发布记录不需要重复持久化完整正文快照，除非后续明确需要审计级发布快照。
* 外部发布接口的 `publishOptions.timerTime` 按 `YYYY-MM-DD HH:mm` 传入；当同一发布批次内章节计划时间不同，本项目按相同计划时间分组提交。

## Requirements

### 1. 平台账号绑定

用户可以在本项目内创建或绑定小说平台账号。

MVP 至少支持番茄平台：

* 创建平台凭据，保存 `credentialUuid`、平台类型、账号标签、凭据状态、最后校验时间。
* 发起二维码登录，向用户展示扫码入口。
* 校验登录状态，展示 ready / pending / expired / invalid 等状态。
* 当发布接口返回 `CREDENTIAL_RELOGIN_REQUIRED` 时，引导用户重新扫码。

### 2. 小说平台书籍绑定

用户可以把本项目中的一本小说绑定到指定平台书籍。

绑定信息至少包括：

* 本项目 `novelId`。
* 平台类型。
* 平台凭据。
* 平台 `bookId`。
* 平台 `bookTitle`。
* 绑定状态和最近同步/校验时间。

### 3. 发布计划生成

用户可以输入发布节奏，例如“每日 8 点发布 2 章节”。

系统需要生成结构化发布计划：

* 起始日期或起始章节。
* 每日发布章节数。
* 计划发布时间。
* 参与发布的章节范围。
* 每章计划发布时间，格式为 `YYYY-MM-DD HH:mm`。
* 计划状态。

如果用户只输入节奏而没有给起始日期，系统应给出低认知负担默认值，例如从用户确认计划后的下一天开始。

### 4. 章节发布状态

每章需要有独立的平台发布状态。

面向用户的核心状态至少包括：

* 未发布：尚未提交到平台。
* 草稿箱：已提交到平台草稿箱。
* 已发布：已提交发布并确认完成。

系统内部还应能记录提交中、失败、需要重新登录、外部 job 状态、错误信息和最后提交时间，用于恢复与排错。

### 5. 发布执行

用户可以按计划提交章节到指定平台。

执行要求：

* 从本项目读取章节标题、正文、章节序号和卷名。
* 调用外部 `POST /publish/jobs`。
* 生成稳定 `requestId`，支持幂等追踪。
* 传入 `credentialUuid`、`bookId`、`bookTitle`、`mode`、`publishOptions` 和章节列表。
* `publishOptions.timerTime` 必须使用 `YYYY-MM-DD HH:mm`。
* 提交时按平台、书籍绑定、发布模式和计划发布时间分组；同一时间发布的多章可以进入同一个外部 job，不同时间的章节需要拆成多个 job。
* 调用后保存 dispatch `jobId`、job 状态、提交批次、章节映射和错误信息。
* 通过 `GET /jobs/:jobId` 查询任务结果并更新本地状态。

### 6. UI / Workflow

发布能力应提供菜单级独立入口“发布平台”，不要嵌入小说列表卡片，也不要放在小说编辑页顶部按钮区。

用户进入发布平台后先选择小说，再在同页完成：

* 平台账号与书籍绑定状态。
* 发布计划编辑与预览。
* 章节列表及每章计划发布时间。
* 每章平台发布状态。
* 提交到草稿箱 / 提交发布操作。
* 登录过期或失败时的恢复入口。

小说工作台内部已有靠近成书完成环节的“发布”步骤能力应保留，供工作台流程继续使用，但主入口应从菜单进入。

UI 文案需要从用户视角描述下一步，例如“绑定番茄账号”“生成发布时间表”“提交到草稿箱”，避免描述实现过程。

## Acceptance Criteria

* [ ] 创建发布平台 task，并保存 PRD。
* [ ] PRD 明确账号绑定、小说书籍绑定、发布计划、发布执行和状态展示范围。
* [ ] PRD 明确参考 API 能力与限制，并明确 `timerTime` 使用 `YYYY-MM-DD HH:mm`。
* [ ] PRD 明确自然语言发布节奏应走 AI 结构化理解，而不是关键词/正则核心逻辑。
* [ ] PRD 明确本项目服务端封装外部 API，前端不直接访问无业务鉴权的 dispatch 服务。
* [ ] PRD 明确发布记录必须保持用户与小说归属隔离。
* [ ] 用户确认 MVP 平台范围和定时发布时间处理方式。
* [ ] 进入实现前补齐 `implement.jsonl` / `check.jsonl` 的 spec 与 research 上下文。

## Definition of Done

* `prd.md` 已保存到 Trellis task。
* 外部 API 摘要已保存到 `research/fanqie-dispatch-api.md`。
* 用户已确认发布时间格式后，补齐实现上下文。
* 后续实现必须先走 feature branch -> 自测 -> beta -> main 的发布路径，因为该功能影响小说成书后的端到端流程、服务端数据模型和外部系统集成。

## Out of Scope

* 本轮不直接写业务代码。
* 本轮不执行数据库破坏性操作。
* MVP 不实现多个平台的完整适配，只保留平台抽象并落地番茄接入。
* MVP 不做外部平台书籍列表自动拉取，除非 dispatch API 增加对应接口。
* MVP 不依赖外部 webhook；先按参考文档使用 job 查询。
* MVP 不用关键词或硬编码正则解析发布节奏。

## Confirmed Decisions

* 发布时间使用 `YYYY-MM-DD HH:mm` 格式传给外部发布接口。
* 发布计划在本项目内保存到每章；提交外部 job 时按相同计划发布时间分组。

## Research References

* [`research/fanqie-dispatch-api.md`](research/fanqie-dispatch-api.md) - 番茄 dispatch API 的接入流程、状态枚举和定时字段格式。

## Technical Notes

* 参考文档：`/tmp/gelsangdispatch-release/docs/api.md`。
* 后端相关入口：`server/src/routes/novel.ts`、`server/src/routes/novelChapterRoutes.ts`、`server/src/services/novel/ChapterService.ts`、`server/src/prisma/schema.prisma`。
* 前端相关入口：菜单级 `/publishing` 发布平台页、`client/src/pages/novels/novelWorkspaceNavigation.ts`、`client/src/api/client.ts`。
* 发布平台数据模型需要同时更新 PostgreSQL 与 SQLite Prisma schema/migrations，且不得使用 reset 类破坏性命令。
