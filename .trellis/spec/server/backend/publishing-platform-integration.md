# Publishing Platform Integration

> Executable contracts for server-owned external novel publishing integrations.

---

## Scenario: Fanqie Dispatch Publishing

### 1. Scope / Trigger

Use this spec when adding or changing any code that binds a user account to an external publishing platform, binds a local novel to an external platform book, generates chapter publish schedules, submits chapters to an external dispatch service, or maps dispatch job state back into local chapter publishing state.

This is mandatory code-spec depth because the feature changes API signatures, cross-layer request/response contracts, database schema, migrations, external service integration, and frontend status behavior.

### 2. Signatures

Backend API shape:

```text
GET    /api/novels/:id/publishing/workspace
POST   /api/novels/:id/publishing/credentials
POST   /api/novels/:id/publishing/credentials/:credentialId/login-bootstrap
POST   /api/novels/:id/publishing/credentials/:credentialId/validate
POST   /api/novels/:id/publishing/bindings
POST   /api/novels/:id/publishing/plans
POST   /api/novels/:id/publishing/plans/:planId/submit
POST   /api/novels/:id/publishing/jobs/:jobId/refresh
```

Database concepts:

```text
PublishingPlatformCredential  user-owned external platform credential
NovelPlatformBinding          novel-owned binding to an external platform book
PublishingPlan                publish schedule generated for a novel/platform binding
PublishingPlanItem            per-chapter planned time and local publish status
PublishingDispatchJob         one external dispatch job for one planned publish time
```

External dispatch contract:

```json
{
  "credentialUuid": "external-credential-uuid",
  "bookId": "external-book-id",
  "bookTitle": "Platform Book Title",
  "mode": "draft",
  "requestId": "local-stable-request-id",
  "publishOptions": {
    "timerTime": "2026-05-09 08:00",
    "useAi": true
  },
  "chapters": [
    {
      "order": 1,
      "title": "第一章",
      "volumeTitle": "第一卷",
      "content": "chapter body"
    }
  ]
}
```

### 3. Contracts

All external dispatch calls must originate from the server. The client must never call the dispatch base URL directly.

`publishOptions.timerTime` is a strict local display/external payload string in `YYYY-MM-DD HH:mm` format. Store enough source data to recompute or display the planned time, but do not silently change this outgoing format.

One external dispatch job has one planned publish time. When selected chapters have different planned publish times, group plan items by identical `YYYY-MM-DD HH:mm` and submit one job per group.

User-facing plan item statuses:

```text
unpublished       not submitted to platform
submitting        submitted locally and waiting for dispatch result
draft_box         draft-mode dispatch job completed
published         publish-mode dispatch job completed
failed            dispatch request/job failed
relogin_required  dispatch reported CREDENTIAL_RELOGIN_REQUIRED
```

Dispatch job statuses remain telemetry and must not replace the user-facing item status:

```text
queued | leased | running | completed | failed
```

Credential and QR contracts:

```text
credentialUuid  external opaque identifier; never infer user ownership from it
qrCodeBase64Png safe to return to the client
qrPageUrl       do not return to the client when it points at the unauthenticated dispatch service
qrImageUrl      do not return to the client when it points at the unauthenticated dispatch service
```

When credential validation returns `ready`, clear the stored QR challenge so the client stops rendering an expired QR block. If the dispatch response includes `accountDisplayName`, sync the local credential label to that display name.

Known platform books for binding should come from local facts already owned by the user, such as existing novel bindings and recent dispatch jobs. Treat the raw external `bookId` as a persisted integration detail, not the primary user-facing concept.

Plan regeneration must continue from local publishing progress before creating new items:

* skip chapters already present in completed or still-active local publish plan items;
* continue after the latest occupied `plannedPublishTime`, not from the original requested start date;
* avoid creating duplicate future items for chapters already in draft, published, or still queued locally.

Remote progress reconciliation may mark local plan items as `draft_box` or `published` even when those items were never submitted by the current local plan. Treat those synchronized states as remote reflections, not as proof of local submission.

Plan clearing must distinguish remote-synced completed states from true local submission evidence:

* allow clearing a local plan when items only became `draft_box` or `published` through remote sync reconciliation and there is no local submission evidence such as `dispatchJobId`, `externalJobId`, item `submittedAt`, or a running/completed dispatch job;
* keep blocking clear when the plan is still submitting or there is real local dispatch evidence.

Plan submission must only submit chapters that still need local processing:

* submit `unpublished`, `failed`, or `relogin_required` items in chapter order;
* skip plan items already marked `draft_box` or `published`, including items synchronized from the remote platform;
* surface completed remote-synced items separately in the client so they do not look like pending local submissions.

AI-first schedule parsing:

* Natural-language schedule instructions are product-facing intent recognition.
* Add or update a registered `PromptAsset` under `server/src/prompting/`.
* Deterministic code may validate structured AI output and compute per-chapter times.
* Do not implement keyword or regex routing as the primary parser.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| User does not own the novel | Return the existing ownership/auth failure; do not reveal publishing data |
| Credential belongs to another user | Reject or return not found; never bind it to the novel |
| Binding points to another user's credential | Reject even if `novelId` is valid |
| `timerTime` is not `YYYY-MM-DD HH:mm` | Reject before dispatch submission |
| Plan item has no chapter content | Reject that item or surface a clear user-facing validation error |
| Dispatch returns `CREDENTIAL_RELOGIN_REQUIRED` | Mark affected items `relogin_required` and expose a server-mediated QR refresh action |
| Dispatch job status is `failed` with relogin error | Map affected items to `relogin_required`, not generic `failed` |
| Dispatch job status is generic `failed` | Mark affected items `failed` and preserve the dispatch error summary |
| Dispatch QR response contains direct URLs | Strip direct dispatch URLs before returning data to the client |
| Plan item is `draft_box` or `published` only because of remote sync | Do not treat it as local submission evidence when deciding whether the local plan can be cleared |
| Submit request contains plan items already synchronized as remote draft/published | Skip those items and only submit chapters that still require local processing |

### 5. Good/Base/Bad Cases

Good: a plan with chapters 1-2 at `2026-05-09 08:00` and chapters 3-4 at `2026-05-10 08:00` creates two dispatch jobs, each with the correct `timerTime` and chapter subset.

Base: a draft submission completes with dispatch status `completed`; affected plan items become `draft_box`, while the dispatch job keeps its raw status/result for telemetry.

Base: remote sync marks chapter 180 as `published` in the current plan because the platform already contains it, but the item has no `dispatchJobId` or `submittedAt`; clearing the local plan remains allowed and the chapter is excluded from the next local submission batch.

Bad: a user supplies another user's credential ID when binding a novel. The service rejects the request because credential ownership is checked independently from novel ownership.

### 6. Tests Required

Required assertions for publishing changes:

* Schedule parsing/computation accepts structured AI output and emits strict `YYYY-MM-DD HH:mm` values.
* Plan submission groups chapters by identical planned publish time.
* Draft-mode completion maps items to `draft_box`; publish-mode completion maps items to `published`.
* `CREDENTIAL_RELOGIN_REQUIRED` maps to `relogin_required` during initial submission and job refresh.
* Credential rows are scoped by user ownership in workspace reads, binding, validate, and submit flows.
* Client-visible QR payloads do not include direct dispatch `qrPageUrl` or `qrImageUrl`.
* Credential `ready` responses clear QR challenge state and sync account label from `accountDisplayName`.
* Workspace known-book options merge local bindings and job history without duplicate dropdown entries.
* Regenerated plans continue after the latest occupied publish time and skip locally occupied chapters.
* Remote-synced `draft_box` or `published` plan items do not block local plan clearing unless local submission evidence exists.
* Plan submission skips chapters already synchronized as remote draft/published items and only submits chapters still pending local processing.
* PostgreSQL and SQLite migrations both include the publishing schema.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Wrong: client receives and renders an unauthenticated external dispatch URL.
return {
  qrPageUrl: challenge.qrPageUrl,
  qrImageUrl: challenge.qrImageUrl,
};
```

#### Correct

```typescript
// Correct: server mediates dispatch and returns only safe display data.
return {
  qrCodeBase64Png: challenge.qrCodeBase64Png ?? null,
  expiresAt: challenge.expiresAt ?? null,
};
```

#### Wrong

```typescript
// Wrong: sends one dispatch job with mixed scheduled times.
await dispatch.publishJob({ publishOptions: { timerTime: firstItem.plannedPublishTime }, chapters: allItems });
```

#### Correct

```typescript
// Correct: one dispatch job per planned publish time.
for (const group of groupPlanItemsByPlannedTime(items)) {
  await dispatch.publishJob({
    publishOptions: { timerTime: group.plannedPublishTime },
    chapters: group.chapters,
  });
}
```
