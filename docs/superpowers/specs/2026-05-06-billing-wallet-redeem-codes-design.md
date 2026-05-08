# 计费、钱包与兑换码设计

Date: 2026-05-06

## Summary

为管理员新增模型价格、套餐模板与兑换码管理；为用户新增钱包管理页、兑换入口和按天聚合的使用记录图表；并把模型调用统一接入余额/套餐校验与扣费流程，确保额度不足时任务和页面模型使用都会被拒绝。

## Current-State Findings

- `server/src/llm/factory.ts`、`server/src/llm/structuredInvoke.ts`、`server/src/llm/modelRouter.ts` 已经形成统一的模型创建、路由和结构化调用入口，是计费拦截的最佳接点。
- `server/src/llm/usageTracking.ts` 已经能记录任务级 tokens，但还没有金钱账本、套餐余额、兑换码或日汇总。
- `client/src/pages/settings/SettingsPage.tsx` 和 `client/src/pages/settings/components/SettingsNavigationCards.tsx` 是现有管理员设置页入口。
- `client/src/router/index.tsx` 已经把 `/settings` 交给 `RequireAdmin`，适合挂载新的计费管理页。
- `server/src/prisma/schema.prisma` 与 `server/src/prisma/schema.sqlite.prisma` 还没有任何计费相关表。

## Product Decisions

### 计费单位

- 模型价格按 `1M tokens` 计价。
- 价格字段使用高精度 decimal，不使用 float。
- 钱包显示为内部计费余额，不接真实支付。

### 价格规则

- 每个模型分别配置 `inputPricePerM`、`outputPricePerM`、`cacheHitPricePerM`。
- 缺少模型价格时，禁止调用该模型。
- `cacheHit` 价格只在供应商实际返回缓存命中 token 时使用；未返回时按 0 处理。

### 套餐规则

- 套餐分两类：
  - `总额度`：兑换后增加钱包余额。
  - `包月套餐`：兑换后增加每日额度，有效期 30 天，每天按 `UTC+8` 刷新。
- 多个包月套餐可以叠加。
- 不支持在原套餐上续期；再次兑换会生成新的独立套餐实例。

### 兑换码规则

- 兑换码一次性使用。
- 生成时可配置为 `余额` 或 `套餐`。
- 管理员可以看到兑换码当前状态。
- 兑换码状态包括 `未兑换`、`已兑换`、`过期`、`停用`。

### 访问规则

- 用户模型调用时按 `先套餐每日额度，再钱包余额` 扣减。
- 只要用户还有可用的套餐额度或钱包余额，就允许继续使用模型。
- 当可用套餐额度和钱包余额都不足时，任务和页面模型调用都必须拒绝。
- 模型调用拦截必须放在后端统一入口，不能只靠前端按钮禁用。

## Options Considered

### Option A: 只做余额扣费

实现最简单，但无法表达包月每日刷新，也无法满足套餐叠加与状态追踪。

### Option B: 余额 + 套餐实例 + 日汇总

推荐方案。

优点：

- 能同时覆盖余额、包月、兑换码和历史记录。
- 能支持管理员管理和用户侧查看。
- 方便把扣费、刷新、图表都落在同一套账本上。

### Option C: 直接依赖外部支付/计费系统

不采用。

原因：

- 当前需求没有真实支付。
- 会明显增加系统复杂度。

## Data Model

### 1. 模型价格表

新增 `BillingModelPrice`。

字段建议：

- `id`
- `provider`
- `model`
- `inputPricePerM`
- `outputPricePerM`
- `cacheHitPricePerM`
- `isActive`
- `createdAt`
- `updatedAt`

约束：

- `(provider, model)` 唯一。
- 价格字段使用 decimal。

用途：

- 管理员维护每个模型的计费价格。
- 用户钱包页只读展示。
- 模型调用前做价格解析与拒绝判断。

### 2. 套餐模板表

新增 `BillingPackageTemplate`。

字段建议：

- `id`
- `kind`，取值 `balance | monthly`
- `name`
- `description`
- `balanceAmount`
- `dailyQuotaAmount`
- `durationDays`
- `isActive`
- `sortOrder`
- `createdAt`
- `updatedAt`

规则：

- `balance` 模板只填 `balanceAmount`。
- `monthly` 模板只填 `dailyQuotaAmount`，`durationDays` 固定 30。

用途：

- 管理员先定义可发放的套餐产品。
- 兑换码生成时从模板派生。

### 3. 兑换码表

新增 `BillingRedeemCode`。

字段建议：

- `id`
- `code`
- `kind`，取值 `balance | monthly`
- `templateId`
- `status`
- `expiresAt`
- `redeemedAt`
- `redeemedByUserId`
- `createdByUserId`
- `createdAt`
- `updatedAt`

规则：

- `code` 唯一。
- `redeemedByUserId` 只在成功兑换后写入。
- `templateId` 指向生成时选择的模板。

### 4. 钱包账户表

新增 `BillingWalletAccount`。

字段建议：

- `userId`
- `balanceAmount`
- `updatedAt`
- `createdAt`

规则：

- 每个用户一条。
- 只保存当前钱包余额快照。

### 5. 套餐实例表

新增 `BillingPackageGrant`。

字段建议：

- `id`
- `userId`
- `templateId`
- `kind`
- `dailyQuotaAmount`
- `dailyRemainingAmount`
- `startsAt`
- `expiresAt`
- `lastResetAt`
- `status`
- `sourceRedeemCodeId`
- `createdAt`
- `updatedAt`

规则：

- `monthly` 记录保存每日额度与剩余额度。
- 每天 `UTC+8` 刷新 `dailyRemainingAmount`。
- 30 天后过期。
- 多个实例同时生效并叠加。

### 6. 使用记录表

新增 `BillingUsageRecord`。

字段建议：

- `id`
- `userId`
- `sourceType`
- `sourceId`
- `provider`
- `model`
- `taskType`
- `promptTokens`
- `completionTokens`
- `cacheHitTokens`
- `totalTokens`
- `inputCost`
- `outputCost`
- `cacheHitCost`
- `totalCost`
- `chargedFromPackageAmount`
- `chargedFromWalletAmount`
- `dayKey`
- `createdAt`

规则：

- 这是钱包页“使用记录”的来源。
- `dayKey` 使用 `YYYY-MM-DD`，按 `UTC+8` 归天。
- 记录既保存 token，也保存金额。

### 7. 日汇总表

新增 `BillingDailyUsageSummary`。

字段建议：

- `id`
- `userId`
- `dayKey`
- `moneySpent`
- `promptTokens`
- `completionTokens`
- `cacheHitTokens`
- `totalTokens`
- `callCount`
- `createdAt`
- `updatedAt`

用途：

- 钱包页折线图直接读取。
- 支持按天平滑绘图，不用每次从明细重算。

## API Design

### Admin

挂在管理员设置路由下，统一走 `requireAdmin`。

- `GET /settings/billing/model-prices`
- `PUT /settings/billing/model-prices`
- `GET /settings/billing/package-templates`
- `POST /settings/billing/package-templates`
- `PUT /settings/billing/package-templates/:id`
- `GET /settings/billing/redeem-codes`
- `POST /settings/billing/redeem-codes`
- `PUT /settings/billing/redeem-codes/:id`

### User

挂在独立钱包路由下，只要求登录。

- `GET /wallet/summary`
- `GET /wallet/usage-daily`
- `GET /wallet/redeem-codes`
- `POST /wallet/redeem-codes/consume`

### Billing Guard

统一后端入口需要提供一个可复用的计费上下文解析接口，用于：

- 解析当前 `userId`
- 拉取当前模型价格
- 计算调用前的预估上限
- 检查套餐与钱包余额
- 在调用完成后记录实际消耗

## Runtime Rules

### 扣费顺序

1. 先扣当天可用的包月额度。
2. 再扣钱包余额。
3. 任一层不足时，继续向下一层；两层都不足则拒绝。

### 价格计算

金额计算按 `1M tokens` 换算：

- `inputCost = inputTokens / 1_000_000 * inputPricePerM`
- `outputCost = completionTokens / 1_000_000 * outputPricePerM`
- `cacheHitCost = cacheHitTokens / 1_000_000 * cacheHitPricePerM`
- `totalCost = inputCost + outputCost + cacheHitCost`

### 调用前预检查

- 进入模型调用前，先做保守预估。
- 预估必须覆盖本次调用可能产生的最大账单。
- 预估不足直接拒绝，不允许先透支再补扣。

### 调用后结算

- 调用结束后记录实际 token 与金额。
- 若实际费用小于预扣，释放剩余额度。
- 若供应商返回缓存命中 token，则按缓存命中价格重算。

### 日刷新

- 包月每日额度按 `UTC+8` 刷新。
- 采用“定时刷新 + 访问时补刷”的双保险。
- 这样即使服务在午夜停机，用户下一次访问也会得到正确额度。

## Frontend Design

### Admin Entry

在系统设置页增加一个“计费管理”入口卡片，进入后显示：

- 模型价格
- 套餐模板
- 兑换码管理

新增路由：

- `/settings/billing`

### Wallet Entry

新增用户路由：

- `/wallet`

页面内容：

- 当前套餐
- 钱包余额
- 模型价格只读表
- 按天聚合的使用记录
- 兑换码输入框

### Usage Chart

- 使用平滑折线图。
- 默认展示最近 30 天。
- 支持切换查看金额和 tokens。
- 使用轻量 SVG 实现，不额外引入重型图表依赖。

### User Copy

- 所有文案从用户视角描述。
- 不写“系统已迁移”“后端已升级”之类开发口吻。
- 错误提示要直接说明下一步操作，例如“当前没有可用额度，请先兑换套餐或余额”。

## Enforcement Scope

以下入口都必须受计费 guard 保护：

- 小说生成
- 章节生成
- 导演模式调用
- 创作中枢聊天
- 任何直接触发 LLM 的页面操作
- 任务中心中会继续发起模型调用的恢复/重试动作

只要是用户发起的模型调用，都不能绕过计费检查。

## Migration Strategy

- 不删除现有数据。
- 新增表默认空数据。
- 旧用户初始余额为 0。
- 旧模型价格默认未配置，管理员必须先补齐后才能开放调用。
- 现有任务记录保留原样，只新增计费字段与汇总表。

## Error Handling

对用户可见的错误建议统一为以下几类：

1. `当前没有可用的套餐或余额，请先兑换后再继续使用。`
2. `当前模型还没有配置价格，请联系管理员。`
3. `兑换码无效、已过期或已使用。`
4. `当前套餐已到期，请重新兑换。`
5. `当前额度不足，无法继续使用模型。`

## Testing Strategy

- 后端单测覆盖：
  - 价格换算
  - 兑换码一次性消费
  - 余额与包月叠加扣减顺序
  - `UTC+8` 日刷新
  - 额度不足时的拦截
- 路由测试覆盖：
  - 管理员可维护模型价格、套餐模板和兑换码
  - 普通用户可兑换码、可查看钱包摘要和使用记录
  - 无权限用户不能访问管理员计费页
- 前端合同测试覆盖：
  - 新增路由是否挂载
  - 钱包入口是否在导航中可见
  - 管理员设置页是否出现计费入口

## Open Questions Resolved Here

- 兑换码生成时可选 `余额` 或 `套餐`。
- 管理员可以看到兑换码当前状态。
- 价格单位固定为 `1M tokens`。
- 扣费顺序固定为 `先套餐每日额度，再钱包余额`。
- 日刷新按 `UTC+8` 执行。
