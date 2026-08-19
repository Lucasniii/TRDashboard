# TRDashboard Agent Guide

## Goal
TRDashboard is developed collaboratively with Claude Code and Codex. GitHub `main` is the stable integration branch. Agents should work on small, task-specific branches and merge through pull requests.

## Responsibilities

### Claude Code — UI / UX owner
Primary areas:
- `src/app/**` presentation and page composition
- `src/components/ui/**`
- `src/components/charts/**`
- `src/components/nav/**`
- feature components under `src/components/**`
- `src/app/globals.css`
- responsive layout, accessibility, typography, spacing, interaction design and visual consistency

Claude may wire existing domain/analytics APIs into UI components, but should avoid changing backend contracts or provider/data architecture unless the task explicitly requires it.

### Codex — logic / architecture owner
Primary areas:
- `src/lib/domain/**`
- `src/lib/data/**`
- `src/lib/analytics/**`
- `src/lib/providers/**`
- API routes, OAuth, synchronization and persistence logic
- `supabase/**`
- tests, type safety, validation, refactoring and performance work

Codex may make minimal UI changes required to expose logic, but should avoid visual redesign unless the task explicitly requires it.

## Shared contract areas
Changes to these areas can affect both agents and require extra care:
- `src/lib/domain/types.ts`
- `src/lib/data/repository.ts`
- provider capability interfaces
- shared chart/component props
- database schema

Before changing a shared contract, search all usages and keep the change backwards-compatible when practical.

## Architecture rules
Preserve the existing dependency direction:

`pages -> analytics -> repository interface -> (mock | local | postgres) <- provider adapters`

- Pages must not call provider APIs directly.
- Analytics must remain pure and perform no I/O.
- Provider-specific response shapes stay inside provider adapters.
- Internal code consumes the domain model, not provider payloads.
- Missing metrics are `null`, never fabricated as `0`.
- Preserve source/provenance metadata for imported records.
- Keep the German UI (`de-AT`, metric) and English code/data model/documentation convention.

## Git workflow
Never implement feature work directly on `main`.

Use one branch per task:
- `ui/<feature>` for UI/UX work
- `logic/<feature>` for application/domain/backend work
- `fix/<issue>` for focused fixes
- `chore/<task>` for repository/tooling changes

Start from the latest `main`. Keep commits focused. Open a pull request back to `main` when the task is complete.

When Claude and Codex work in parallel, they should use separate branches. Avoid having both agents modify the same file at the same time when possible.

## Before finishing a task
Run the relevant checks, normally:

```bash
npm run typecheck
npm run lint
npm run build
```

Do not knowingly leave the repository in a failing state. If a check cannot be run or a failure is pre-existing, document that clearly in the pull request.

## Scope discipline
- Do not perform unrelated refactors.
- Do not replace working architecture just because another pattern is preferred.
- Reuse existing components and domain abstractions before adding new ones.
- Never commit credentials, OAuth secrets, tokens or local provider data.
- Keep `.env.local` and runtime `data/` private/gitignored.

## Pull request handoff
A PR should state:
- what changed
- why it changed
- important files/contracts touched
- checks performed
- anything the other agent should know before building on top of it
