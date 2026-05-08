# Technical Design Notes

## Scope

Implement a first publishing platform integration for Fanqie while keeping the local model platform-extensible.

The product entry point should live in the novel workspace as a publishing step near the end of the writing flow. System settings can still contain lower-level configuration later, but the user should be able to bind, plan, submit, and inspect status from the novel.

## External API Contract

Use the dispatch API summarized in `research/fanqie-dispatch-api.md`.

Important implementation contract:

* Submit publishing through the server only; the frontend must not call `https://dispatch.lucky37.cn` directly.
* `publishOptions.timerTime` must be sent as `YYYY-MM-DD HH:mm`.
* One dispatch job has one `publishOptions.timerTime`. If selected chapters have different planned publish times, group them by identical planned time and submit one job per group.
* Use a stable local `requestId` per submitted group for idempotency and traceability.
* Map `CREDENTIAL_RELOGIN_REQUIRED` to a local state that prompts the user to refresh QR login.

## Suggested Data Model

Use dedicated publishing tables rather than adding platform fields directly to `Novel` or `Chapter`.

Suggested concepts:

* Platform credential: user-owned platform account binding. Store platform key, label, external `credentialUuid`, credential status, account display data, last validation time, and last login challenge metadata when useful.
* Novel platform binding: novel-owned binding to a platform book. Store `novelId`, platform credential, external `bookId`, external `bookTitle`, binding status, and timestamps.
* Publish plan: novel/platform binding-owned plan. Store original user instruction, structured schedule parameters, mode, chapter range, timezone, status, and timestamps.
* Publish plan item: one row per planned chapter. Store `chapterId`, chapter order/title snapshot fields needed for display, planned publish time, user-facing publish status, dispatch job link, submitted/published timestamps, and last error.
* Publish job/batch: one row per external dispatch job. Store local request ID, external `jobId`, mode, planned publish time, dispatch status, credential UUID, book ID/title, chapter count, result JSON, last error, and timestamps.

Keep user isolation explicit. User-owned credential rows should link to `User`; novel binding and plan rows should link through `Novel` and respect existing novel ownership checks.

## Status Mapping

User-facing item statuses:

* `unpublished`: not submitted to the platform.
* `submitting`: local server submitted or is waiting on dispatch job.
* `draft_box`: external draft job completed.
* `published`: external publish job completed.
* `failed`: dispatch job failed or request failed.
* `relogin_required`: dispatch reported credential relogin is needed.

Dispatch job statuses should remain separate telemetry:

* `queued`
* `leased`
* `running`
* `completed`
* `failed`

When a draft-mode job completes, update affected items to `draft_box`. When a publish-mode job completes, update affected items to `published`.

## Schedule Generation

The product-facing schedule instruction parser must be AI-first.

Implementation direction:

* Add a registered product prompt under `server/src/prompting/` for schedule instruction parsing.
* The prompt should return structured fields such as start date, publish time, chapters per day, chapter range, timezone, and any assumptions.
* Deterministic code may validate the structured AI result and compute per-chapter datetimes.
* Do not add keyword/regex routing as the main parser. If AI parsing fails, return a clear error and let the user adjust the instruction or model settings.

For the example “每日 8 点发布 2 章节”, compute chapter 1 and 2 at the first publish date 08:00, chapter 3 and 4 at the next date 08:00, and so on.

## Backend Shape

Expected modules:

* A dispatch API client that wraps credentials, login bootstrap, validate, publish jobs, and job query.
* A publishing service that owns local persistence, grouping, status mapping, and ownership-aware operations.
* Novel publishing routes registered near existing novel routes, plus user-level credential routes if needed.
* Zod schemas for route bodies and external API responses.

Use existing auth and novel ownership middleware patterns. Avoid exposing credential operations across users.

## Frontend Shape

Add a publishing workspace view to the novel editor.

The view should show:

* Platform account binding status and QR login/refresh actions.
* Novel platform book binding form with `bookId` and `bookTitle`.
* Schedule instruction input and generated plan preview.
* Chapter rows with planned publish time and status.
* Submit to draft box and submit publish actions.
* Job/status refresh and relogin recovery.

User-facing copy should describe the user task directly, such as “绑定番茄账号”, “生成发布时间表”, “提交到草稿箱”, and “刷新发布状态”.

## Tests

Add focused tests for:

* Schedule datetime computation from structured AI output.
* Grouping plan items by `YYYY-MM-DD HH:mm`.
* Dispatch status mapping to user-facing item statuses.
* Relogin error mapping.
* Ownership isolation for publishing routes.
* Frontend contract tests for publishing query keys/API helpers and workspace navigation when practical.
