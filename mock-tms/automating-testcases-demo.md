---
name: automating-testcases
description: Use when a QA engineer wants to turn a manual test case from a test management system (TMS) into a Playwright e2e autotest — triggered by a test case ID, a test ID tag (e.g. @allure.id), a link to the case, or phrases like "автоматизируй кейс", "напиши автотест по кейсу", "automate test case", "turn this test case into a spec". Fetches the case via MCP, analyzes it, finds a reference spec, and writes a ready .spec.ts following the project's Page Object rules.
---

# Automate a test-management-system case into a Playwright spec

## Overview

Respond in the language of the user's request (code, comments, identifiers stay in English) unless the project's rules file says otherwise.

This skill is a **workflow orchestrator**, not a rules document. It drives the end-to-end flow: fetch a manual test case from the test management system (TMS) → analyze it → find similar existing tests in the e2e repo → write a ready Playwright test following the project's Page Object rules → run checks.

**One spec ≠ one test case.** A `.spec.ts` file groups several tests of the same area — each test is a separate fixture call (e.g. `testAsNewUser({...})("<name> @allure.id=<ID>", async ({ page }) => {...})`). Automating a case usually means **adding a new `test` to an existing spec** for that `Feature`/`Story`, not creating a new file. Create a new file only when no spec covers the area yet (see step 3).

**Single source of truth for HOW to write the test:** the project's test-writing rules file in the e2e repo — typically `.cursor/rules/e2e-rules.mdc`, `AGENTS.md`, or a similar conventions doc. This skill does NOT duplicate POM rules, fixture rules, or locator conventions — it relies on them. Read that file before writing any code. If it is missing, STOP and tell the user.

## Project configuration

Fill these in (per project) before first use, or ask the user:

| Placeholder | Meaning | Generic example |
|---|---|---|
| `<TMS_PROJECT_ID>` | Numeric project id in the TMS where e2e scenarios live | `12345` |
| `<E2E_REPO>` | Path/name of the e2e test repo | `e2e-tests` |
| `<FRONTEND_REPO>` | The frontend app/service repo | `web-app` |
| `<APP_PORT>` | Port the app under test runs on | `8080` |

## When to use

- User gives a test case ID, a test ID tag (e.g. `@allure.id`), or a TMS link and wants an autotest.
- User says "автоматизируй кейс 12345", "напиши автотест по кейсу", "automate test case", "сделай spec".

**When NOT to use:**

- Writing API tests (a different workflow, usually with its own conventions).
- Editing an existing spec unrelated to a TMS case.

## Workflow

Create a todo item per step and do them in order.

### 1. Fetch the test case

Use the TMS MCP tool `mcp__demo-tms__get_testcase` on server `demo-tms`:

```json
{ "id": "<ID>" }
```

- If the user gave a name instead of an ID, search first with `mcp__demo-tms__find_testcases` (`{ "query": "<name>" }`) and pick the match.
- If not found, or the `Feature`/`Story` custom fields are empty → STOP and ask the user.

### 2. Present the analysis

Show, in a structured form: `name`, `description`, `precondition`, `scenario` (steps), `parameters`, and the relevant custom fields (e.g. `Priority`, `Feature`, `Story`, `Component`). Then propose where the test goes, in this priority:

1. **An existing spec** for the same `Feature`/`Story` area — add a new `test` there (preferred).
2. Only if none exists, a **new file** following the repo's existing folder layout for that `Feature`/`Story` area (e.g. `tests/<feature-area>/<story>.spec.ts` — mirror the conventions already present in the repo).

Step 3 decides between these — don't assume a new file.

### 3. Find a reference test (both ways)

- **By location** — list existing specs under the proposed `Feature`/`Story` folder; they share the same area → same pages/components.
- **By scenario meaning** — grep across `tests/` for page objects / actions matching the scenario steps (e.g. the entity being tested, the modal opened), even in other folders, to find reusable page objects and patterns.

Report which spec(s) you take as a reference and which `pages/` and `components/` you will reuse.

**Also decide here whether the new test joins an existing spec or needs a new file** — if a spec already covers this `Feature`/`Story`, add the `test` to it rather than creating a new file.

### 4. Choose the fixture

Pick per the project's rules file — typically role-based fixtures (e.g. new-user / admin / guest / unauthenticated variants, plus any project-permission parameter).

**If ambiguous, ask the user** — do not guess the permission level.

### 5. Write the test

Add the test to the spec chosen in step 3 (existing file when one covers the area; new file only otherwise). Follow the Page Object Pattern from the project's rules file strictly:

- NO `expect()` and NO locator declarations in the spec — only calls to page/component methods.
- Preconditions via fixtures and the project's API helpers (e.g. `tests/api-utils/`) only — not via the tested UI path.
- Public methods wrapped in step annotations (e.g. `allure.step()`); naming per project convention (e.g. `goTo*/click*/fill*/open*/check*`).
- Test name carries the TMS id tag when the framework supports it, e.g. `"Reopen closed defect @allure.id=<ID>"`.

**If a needed page object / component / method is missing → create or extend it, but ASK for confirmation first.**

**Never rely on fragile selectors (CSS classes, text, nth-child).** Locator priority is `getByTestId()` → `getByRole()` → `getByLabel()`. If an element has no `data-testid`, **add it in the frontend** (`<FRONTEND_REPO>`) and then use `getByTestId()` — do NOT fall back to a fragile selector. Confirm with the user before editing the frontend, then make the `dataTestId` change.

**After any `data-testid` change in the frontend, the running app must be rebuilt** — see step 6. Until rebuilt, the new `data-testid` is not in the running UI and the test will fail for the wrong reason.

### 6. Rebuild the app (only if a frontend `data-testid` was added)

If step 5 added/changed a `data-testid` in the frontend, the running UI must be rebuilt before the test can pass. Run the project's rebuild procedure from the **repo root** (locate it at runtime — e.g. where the build and compose files live). Example for a Gradle + Docker Compose stack:

1. `./gradlew clean build -x test`
2. After it succeeds: `docker-compose -f docker-compose.yml -f docker-compose-all.yml up -d --build`

This is a heavy step — confirm with the user before running it. Skip entirely if no frontend change was made.

### 7. Run checks

Run from `<E2E_REPO>`. Prefer the bundled script `scripts/check.sh <file1> <file2> ...` (see Appendix) over typing the commands by hand. **Scope lint and formatting to ONLY the files you created or edited — never the whole project.** Project-wide lint/format scripts reformat unrelated files and pollute the branch; do NOT use them here. Collect the list of files you touched (the new spec plus any page/component you edited) and pass them explicitly:

1. `npx eslint --fix <file1> <file2> ...` — autofix, scoped to your files
2. `npx eslint <file1> <file2> ...` — verify 0 errors in your files
3. `npx prettier --write <file1> <file2> ...` — format only your files
4. Typecheck (e.g. `npm run check-types` / `tsc --noEmit`) — whole-project by nature but does NOT modify files, so running it project-wide is safe; fix any errors in your files.
5. Run the test: `npx playwright test <path> -g "<test-name>"` (plus whatever env the project requires, e.g. a port override).

After the checks, run `git status --short` and confirm the branch contains ONLY the files you intended to change. If a tool touched unrelated files (e.g. a stray project-wide format), `git restore` them so the branch diff stays limited to your new/edited files.

The app under test is expected on `<APP_PORT>`. If it is not reachable and no rebuild was done in step 6, **do NOT start the server yourself** — skip the test run and warn the user that the test was written but not run. Fix lint/type/test failures up to green within what is available.

### 8. Report

Summarize: final file path, reference tests used, pages/components reused vs. created, whether a frontend `data-testid` / rebuild was needed, and the status of each check (incl. whether the test was actually run).

## Quick reference

| Step | Action | Key command / tool |
|---|---|---|
| 1 | Fetch case | `mcp__demo-tms__get_testcase` with `{ "id": "<ID>" }`; by name — `mcp__demo-tms__find_testcases` |
| 2 | Analyze + propose location | existing spec (preferred) vs new file |
| 3 | Find reference | list area folder + grep `tests/` for matching page objects |
| 4 | Pick fixture | role-based fixtures per rules file; ask if ambiguous |
| 5 | Write test | POM only; no `expect`/locators in spec; `getByTestId()` first |
| 6 | Rebuild (conditional) | project's rebuild procedure; confirm first |
| 7 | Check | `scripts/check.sh <files>`; then `git status --short` |
| 8 | Report | path, references, reuse, rebuild, check statuses |

## Common mistakes

- **Creating a new `.spec.ts` per test case** — one spec holds many tests; add a `test` to the existing spec for that `Feature`/`Story` unless none exists.
- **Putting `expect`/locators in the spec** — they must live in page/component classes. Re-read the POM rules.
- **Duplicating rules into the spec/skill** — defer to the project's rules file; it is the source of truth.
- **Guessing the fixture/permission** — ask when unsure.
- **Falling back to a fragile selector** (CSS class, text, nth) when there is no `data-testid` — instead add a `data-testid` in the frontend and use `getByTestId()`.
- **Forgetting to rebuild the app after a `data-testid` change** — the new attribute is not in the running UI until the rebuild, so the test fails for the wrong reason.
- **Answering in the wrong language** — respond in the user's language unless project rules say otherwise.
- **Auto-starting the server without consent** — ask first; a rebuild is heavy.
- **Running project-wide format/lint scripts** — they reformat and stage unrelated files across the whole repo, polluting the branch. Scope eslint/prettier to your edited/new files only, then `git status --short` to confirm the diff is limited to them.

## Appendix: `scripts/check.sh`

Save this next to the skill as `scripts/check.sh`; step 7 prefers it over hand-typed commands:

```bash
#!/usr/bin/env bash
# Scoped quality checks for files created/edited by the automating-testcases skill.
# Usage: scripts/check.sh <file1> [file2 ...]
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <file1> [file2 ...]" >&2
  exit 2
fi

FILES=("$@")

npx eslint --fix "${FILES[@]}"   # autofix, scoped
npx eslint "${FILES[@]}"         # verify 0 errors
npx prettier --write "${FILES[@]}"
npm run check-types              # whole-project typecheck; modifies nothing
git status --short               # confirm the diff is limited to your files
```
