# Tasks: Модерація скарг на коментарі

**Input**: Design documents from `/specs/002-moderation-reports/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Status**: Implemented on Cloudflare Workers + D1; модерація доступна на https://tusivka.byndevav.workers.dev/moderation.

**Tests**: included because constitution V requires tests for security and idempotency.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, US3)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuration and database migration

- [x] T001 [P] Add `moderatorEmails` from `MODERATOR_EMAILS` with default `arsen@tusivka.local` in `src/lib/env.ts`
- [x] T002 [P] Extend `Reports` with `status`, `resolved_at`, `resolved_by`; backfill `event_id`; dedupe old open rows and create partial unique index `(comment_id, reporter_id) WHERE status='open'` in `src/lib/db.ts`
- [x] T003 [P] Create `ModerationActions` table without FK to `Comments` in `src/lib/db.ts` (see data-model.md `ModerationAction.action`)

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shared moderation helpers used by all stories

- [x] T004 Write failing tests for role check, open-report dedupe and action logging in `tests/moderation.test.ts`
- [x] T005 Implement `isModerator(email, configured?)`, `findOpenReport()`, `createOpenReport()`, `logModerationAction()` in `src/lib/moderation.ts`
- [x] T006 Run `npm test` to confirm foundational helpers pass in `tests/moderation.test.ts`

## Phase 3: User Story 1 - Одна скарга від користувача (Priority: P1)

**Goal**: repeated reports from the same user produce one open report.

**Independent Test**: POST the same report twice and assert one row; anonymous POST is rejected.

- [x] T007 [US1] Add live-HTTP assertions for duplicate report and anonymous report in `tests/self-audit.mjs`
- [x] T008 [US1] Rewrite `src/pages/api/comments/[id]/report.ts` to use `createOpenReport()`, store `event_id` and validation from data-model.md `Report.reason`
- [x] T009 [US1] Verify duplicate and anonymous report behavior with curl against the running server

## Phase 4: User Story 2 - Черга модератора (Priority: P1)

**Goal**: moderators can review and resolve reports in a dedicated interface.

**Independent Test**: moderator sees a report, dismisses one and deletes another; non-moderator gets 403.

- [x] T010 [P] [US2] Add moderator role tests for page/API access in `tests/moderation.test.ts`
- [x] T011 [P] [US2] Create `src/pages/api/moderation/[id]/dismiss.ts` with moderator guard, status update and action log
- [x] T012 [P] [US2] Create `src/pages/api/moderation/[id]/delete.ts` with moderator guard, comment deletion and action log
- [x] T013 [P] [US2] Create `src/pages/api/moderation/reports.ts` returning open reports as JSON for moderators only
- [x] T014 [US2] Create `src/pages/moderation.astro` rendering the open-report queue with event, comment, author, reporter, reason, date and action forms
- [x] T015 [US2] Pass `isModerator` from `src/layouts/Layout.astro` and add the «Модерація» link in `src/components/site/SiteHeader.astro`

## Phase 5: User Story 3 - Підстава для автора події (Priority: P2)

**Goal**: event-author deletion with a report flag keeps an audit trail; existing rights unchanged.

**Independent Test**: event author deletes a flagged comment and a `ModerationAction` row appears.

- [x] T016 [US3] Add test for flagged event-author deletion in `tests/moderation.test.ts`
- [x] T017 [US3] Update `src/pages/api/comments/[id]/delete.ts` to log `event_author_delete` and keep 403 for strangers

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: documentation and full verification

- [x] T018 [P] Update `AUDIT.md` and `README.md` with moderation setup (`MODERATOR_EMAILS`) and endpoints
- [x] T019 Run `npm test`, `npx astro check`, `npm run build`, `BASE_URL=... node tests/self-audit.mjs` and browser verification at 375px and desktop

## Dependencies

- Setup (T001–T003) → Foundational (T004–T006) → US1 (T007–T009)
- US2 depends on T005/T006 only; US3 depends on T003/T005
- T019 depends on all other tasks

## Parallel Execution Examples

- T001, T002, T003 touch different concerns and can run together.
- T011, T012, T013 create separate API routes and can run together.
- T018 can run alongside T010–T017.

## Implementation Strategy

MVP = Phase 1 + Phase 2 + US1 (duplicate reports fixed). Then US2 adds the moderator queue.
US3 preserves existing deletion rights with an audit trail.
