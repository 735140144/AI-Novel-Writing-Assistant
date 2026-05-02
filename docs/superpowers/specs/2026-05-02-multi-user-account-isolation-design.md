# Multi-User Account Isolation Design

Date: 2026-05-02

## Summary

This design upgrades the current single-user AI novel platform into an account-isolated multi-user system with public registration. Each user owns a fully private creative workspace. Existing assets remain private under `caoty@luckydcms.com`, which becomes the initial administrator account.

The system will enforce login for all business pages. Only `login`, `register`, `verify-email`, `forgot-password`, and `reset-password` remain public. Email verification and password reset are required and will use direct SMTP delivery.

The design intentionally targets account isolation, not team collaboration. Every user gets their own novels, worlds, knowledge base, genres, story modes, title library, base characters, style assets, tasks, and model route preferences.

## Current-State Findings

- Backend authentication is not implemented yet. [`server/src/middleware/auth.ts`](/Users/caoty/IdeaProjects/AI-Novel-Writing-Assistant/server/src/middleware/auth.ts:1) currently passes all requests through.
- Frontend routes are all mounted inside the main app shell with no login guard. [`client/src/router/index.tsx`](/Users/caoty/IdeaProjects/AI-Novel-Writing-Assistant/client/src/router/index.tsx:26)
- Core business roots such as novels, worlds, knowledge documents, genres, story modes, and title data do not currently belong to a user.
- Existing knowledge/RAG `tenantId` values are not a reliable future isolation boundary and must not be reused as the source of truth.
- Model vendor/API key configuration is system-level today and should stay admin-only.
- Per-stage model route selection is global today and must become user-specific.

## Product Decisions

### Confirmed decisions

- Multi-user mode is account-isolated.
- Public registration is enabled.
- Existing assets stay fully private under `caoty@luckydcms.com`.
- `caoty@luckydcms.com` is the initial `admin`.
- Genres, story modes, title library, base characters, style assets, and similar creative assets are user-private.
- Model vendors and provider keys are shared system infrastructure, hidden from normal users, and configurable only by admins.
- Normal users may choose models for each stage through their own model route settings.
- All business pages require login. Unauthenticated access always redirects to login.
- Email verification, forgot password, and reset password are required.
- Email delivery uses direct SMTP.
- Admins do not automatically gain read access to other users' private creative content.

### Non-goals

- No team workspace or multi-member collaboration.
- No shared novels or shared editing sessions.
- No cross-user asset marketplace.
- No admin-by-default content auditing feature in this phase.

## Options Considered

### Option A: Minimal authentication patch

Add users and login, but keep most current global tables as-is.

Why rejected:

- Fails the isolation goal.
- Global creative libraries would leak across accounts.
- Task and overview queries would remain risky and inconsistent.

### Option B: Account-isolated multi-user system

Add full authentication, add user ownership to private roots and task records, split admin system configuration from user-facing model routes, and rebuild knowledge isolation around `userId`.

Why chosen:

- Matches the requested product model.
- Keeps later collaboration optional without forcing it now.
- Gives a clean privacy boundary with manageable migration complexity.

### Option C: Workspace/team architecture from day one

Add workspace, membership, and role hierarchies immediately.

Why rejected:

- Over-scoped for the current goal.
- Adds avoidable complexity to auth, queries, and data migration.
- Solves future collaboration problems that are explicitly out of scope now.

## Goals

- Every non-admin user sees only their own data.
- Existing single-user data is migrated safely into the admin account.
- Admin-only system settings remain available without exposing secrets to normal users.
- Users can register, verify email, log in, recover passwords, and then work inside a fully private writing workspace.
- Task center, knowledge search, and model routing respect the authenticated user boundary everywhere.

## Authentication Architecture

### User model

Add a `User` table with:

- `id`
- `email` unique
- `passwordHash`
- `role` enum: `admin | user`
- `status` enum: `pending_verification | active | disabled`
- `emailVerifiedAt`
- `createdAt`
- `updatedAt`

### Session model

Use server-side sessions with `HttpOnly` cookies instead of exposing long-lived bearer tokens to the client.

Add `UserSession` with:

- `id`
- `userId`
- `sessionTokenHash`
- `expiresAt`
- `lastSeenAt`
- `ip` optional
- `userAgent` optional
- `createdAt`

### Verification and reset tokens

Add:

- `EmailVerificationToken`
- `PasswordResetToken`

Each stores:

- `id`
- `userId`
- `tokenHash`
- `expiresAt`
- `consumedAt`
- `createdAt`

Tokens are single-use. Raw tokens are only sent via email and never stored in plain text.

### Request auth flow

1. Client submits credentials.
2. Server validates user status and password.
3. Server creates a session row and sets a secure cookie.
4. Auth middleware resolves the session and populates `req.user`.
5. Protected routes reject unauthenticated requests.
6. Unverified accounts may log in only far enough to complete email verification or request a new verification message.

## Frontend Routing and Login UX

### Public routes

- `/login`
- `/register`
- `/verify-email`
- `/forgot-password`
- `/reset-password`

### Protected routes

All current business routes become protected.

Unauthenticated behavior:

- Visiting any protected route redirects to `/login?next=<original-path>`.

Authenticated behavior:

- Visiting `/login` or `/register` redirects to the target `next` route when safe, otherwise `/novels`.

Unverified-user behavior:

- An authenticated but unverified user cannot access business routes.
- They are redirected to verification guidance until verification succeeds.

### Login page design

The login page should feel like a writing-product entry surface, not a plain admin console:

- Desktop uses a two-column layout.
- Left side communicates the product promise: continue your novel, worldbuilding, knowledge base, and task progress.
- Right side contains the login card and links to register or recover password.
- Mobile collapses to a single-column form-first layout.
- Use a warm, paper-like background direction with clear foreground contrast.
- Avoid exposing developer or migration language in any user-facing copy.

## Authorization Model

### Roles

- `admin`
  - Can manage SMTP
  - Can manage provider/API key settings
  - Can manage system-level settings
  - Can manage users
  - Does not automatically browse other users' private creative data

- `user`
  - Can access only their own business data
  - Can configure only their own model route preferences
  - Cannot access provider keys, SMTP, or system admin settings

### Admin boundaries

System management privilege and content visibility are separate concerns. This phase grants admin infrastructure control, not universal content read permission.

## Data Ownership Model

### User-private root resources

These tables must gain a required `userId` and become user-owned roots:

- `Novel`
- `World`
- `KnowledgeDocument`
- `BaseCharacter`
- `StyleProfile`
- `NovelGenre`
- `NovelStoryMode`
- `TitleLibrary`

Each should add an index on `userId` and route/service queries must always filter by the current user.

### User-private high-frequency task resources

These tables should also store direct `userId` instead of relying only on joins:

- `GenerationJob`
- `NovelWorkflowTask`
- `AgentRun`
- `BookAnalysis`
- `ImageGenerationTask`
- `TaskCenterArchive`

Reason:

- task center list
- task overview counts
- archive and restore operations
- failure and approval filters

all need efficient, explicit user filtering.

### Derived resources

Tables that are always loaded through a user-owned root may inherit isolation indirectly through the root relationship, but all service queries must still be audited. Any place that supports direct listing, searching, or reconciliation should prefer explicit user filters when practical.

## Model Configuration Split

### System-level provider configuration

Keep system provider secrets global and admin-only:

- existing `APIKey` table remains the source of provider secrets and base URLs
- SMTP and other infrastructure configuration are also admin-only

### User-level model routes

Replace the current global route behavior with a user-scoped table such as `UserModelRouteConfig`:

- `id`
- `userId`
- `taskType`
- `provider`
- `model`
- `temperature`
- `maxTokens`
- `requestProtocol`
- `structuredResponseFormat`
- `createdAt`
- `updatedAt`

Unique key:

- `[userId, taskType]`

Behavior:

- Admin chooses which providers/models are available at the system level.
- Normal users only choose among those available options for their own route preferences.
- One user's route changes must never affect another user.

## SMTP and Email Delivery

The system needs admin-managed SMTP settings for:

- registration verification email
- resend verification email
- forgot password email
- reset password email

Recommended shape:

- `SystemEmailSettings` persisted through the existing settings/secret infrastructure
- host
- port
- secure
- username
- password secret reference
- from name
- from email

The UI for this is admin-only and not visible to normal users.

## Knowledge Base and RAG Isolation

The old `tenantId` path is explicitly not trustworthy for future isolation.

New rule:

- `userId` is the authoritative isolation key.
- Knowledge indexing, chunk ownership, and retrieval namespace/collection selection must resolve from `userId`.
- Existing knowledge indexes should be rebuilt after migration instead of assuming old tenant metadata is safe.

Recommended operational behavior:

1. migrate document ownership
2. rewrite indexing jobs to derive namespace from user ownership
3. rebuild all existing admin-owned indexes
4. only then open registration

## Migration Plan

### Phase 1: Internal cutover, admin-only validation

1. Add auth tables and user ownership columns.
2. Create the initial admin user: `caoty@luckydcms.com`.
3. Backfill all existing private assets to that admin user.
4. Backfill task ownership.
5. Enable login gating across the app.
6. Keep registration disabled temporarily.
7. Verify that the admin account sees all previous assets and no data is lost.
8. Rebuild knowledge indexes under the new ownership model.

### Phase 2: Public registration

1. Enable `/register`.
2. Enable SMTP-driven verification emails.
3. Enable forgot password and reset password flows.
4. Confirm new users start with empty private workspaces.
5. Confirm user route isolation, task isolation, and knowledge isolation.

### Migration sequencing details

Order matters:

1. backup database
2. validate backup existence and size
3. add new tables and nullable ownership columns
4. insert admin user
5. backfill root resource ownership
6. backfill task ownership
7. rebuild knowledge indexes
8. update code paths to require authenticated filtering
9. tighten columns and constraints where safe
10. enable public registration

The migration must not use destructive reset workflows. It should follow expand, backfill, verify, and then enforce.

## Testing and Acceptance

### Authentication

- public registration succeeds
- verification email is sent
- verification link is one-time and expires correctly
- forgot password sends reset email
- reset password changes login behavior immediately
- all protected routes redirect unauthenticated users to login

### Data isolation

- a new user sees none of the admin's existing novels, worlds, tasks, knowledge, titles, genres, story modes, characters, or style assets
- admin legacy data remains fully visible to the admin account
- user A cannot affect user B model routes, tasks, or libraries

### Admin boundaries

- only admin can access provider key settings
- only admin can access SMTP settings
- normal users never see provider secrets or raw infrastructure configuration

### Task center

- list, detail, overview, archive, restore, and approval-related counts are all user-scoped
- no task metadata leaks across users

### Knowledge/RAG

- indexing, retrieval, and rebuild paths all isolate by `userId`
- old tenant identifiers are no longer trusted as the final isolation boundary

### Rollout validation

- phase 1 is completed with admin-only login before public registration opens
- migration runs against a verified backup
- no destructive data operation happens without the required backup and verification checks

## Risks

- The RAG migration is the highest-risk area because old tenant semantics are already contaminated.
- Task center queries are easy to miss because they aggregate across multiple tables.
- Global creative libraries must be fully privatized or they will leak across accounts.
- Model routing must be split cleanly or users will overwrite each other's stage preferences.

## Implementation Phases

### Phase A: Auth foundation

- add auth tables
- add session middleware
- add login/register/verify/reset APIs
- add frontend auth shell and protected route guard

### Phase B: Ownership model

- add `userId` to root resources
- add `userId` to task tables
- backfill admin ownership
- enforce service-layer user filtering

### Phase C: Admin/system split

- keep provider keys and SMTP admin-only
- add user-scoped model route config
- hide system settings from normal users

### Phase D: Knowledge rebuild

- move knowledge isolation to `userId`
- rebuild admin-owned indexes
- validate query isolation

### Phase E: Public launch

- open registration
- enable verification and reset emails
- run full acceptance checks

## Final Recommendation

Proceed with Option B: account-isolated multi-user architecture, implemented in phases. This gives the requested privacy boundary, keeps admin infrastructure control separate from user creativity, and avoids prematurely adopting a heavier team/workspace model.
