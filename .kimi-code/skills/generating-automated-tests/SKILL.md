---
name: generating-automated-tests
description: Use when a user wants to turn a manual test case from the mock tms behind an MCP server into an automated test. Trigger by a test case ID, or phrases like "автоматизируй тест-кейс". Fetch the case, analyze it, find a reference test, and write a ready test file.
---

# Turn a manual test case into an automated Playwright test

## Overview

Respond in the language of the user's request (code stays in English) unless the project's rules file says otherwise.

**One spec ≠ one test case.** Automating a case usually means **adding a `test(...)` to an existing `.spec.ts`** for that feature area — create a new file only when nothing covers the area yet.

**Single source of truth for HOW to write the test:** the `e2e-rules.md` file. Read that file first; if it is missing, STOP and tell the user.


## When to use

User gives a test case ID and wants an automated test.

**When NOT to use:** for tests not generated from a test case.

## Workflow

Create a todo per step; do them in order.

### 1. Fetch the test case

Retrieve the test case via the MCP tool `mcp__demo-tms__get_testcase` with { "id": "<ID>" }. If the user gave a name instead of an ID, search first with `mcp__demo-tms__find_testcases` and pick the match. If not found, STOP and ask the user.

### 2. Find a reference test

Look for a reference test in the `test/` directory, based on the feature and story of the original test case. 

Decide, whether to use an existing `spec.ts` file or create a new one.

### 3. Choose the fixture

By default, use the new-user fixture. If the test case has a precondition that requires a different role, pick the fixture that matches the role. **If ambiguous, ask the user**.

### 4. Write the test

- Use the test case metadata (feature, story, test ID) to fill the metadata for the new test.
- If a page object or its method needs to be created, __ASK__ first. 
- If a `data-testid` needs to be added to the app, __ASK__ first.

### 5. Run checks

Run checks per `e2e-rules.md` → **Code Quality**. Run the
new test: `npx playwright test <path> -g "<test-name>"`. To make sure the checks haven't touched anything they weren't supposed to, run
`git status --short`, then `git restore` or delete anything that shouldn't have been changed or generated.

### 6. Report

Output the following:
- final path
- which reference spec was used, if any
- which page object was used and/or created
- the status of each check

## Common mistakes
