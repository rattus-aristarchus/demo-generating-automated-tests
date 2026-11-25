# login-demo-app

A small login application implementing the behaviour described in
`../mock-tms/test-cases.json` (TC-01…TC-11). Zero dependencies — plain Node.js,
designed to be tested with TypeScript + Playwright.

## Run

```bash
npm run dev                 # http://127.0.0.1:7100
npm run dev -- --port 8080  # custom port (PORT env var works too)
```

## Accounts

| Login (case role) | Password      | Note                          |
| ----------------- | ------------- | ----------------------------- |
| `alice`           | `password123` | login "A" from the test cases |
| `carol`           | `password456` | login "C" from the test cases |
| any other         | —             | unregistered login "B"        |

## Pages

- `/login` — login form. Redirects authenticated users to `/home`.
- `/home` — main page (protected).
- `/dashboard` — protected page; anonymous visits redirect to
  `/login?returnUrl=/dashboard`, and a successful login returns the user here
  instead of `/home` (TC-02).

## API

- `POST /api/login` — body `{ "login", "password", "returnUrl" }`.
  - `200 { ok: true, redirectUrl }` — success; sets the `sid` session cookie.
  - `401 { ok: false, code: "invalid_credentials", message: "Неверный логин или пароль" }` —
    failures 1–4. Identical for a wrong password and an unknown login (TC-06/TC-07).
  - `423 { ok: false, code: "locked", message: "Слишком много попыток. Попробуйте через 15 минут" }` —
    5th consecutive failure and every attempt while the 15-minute lock is active,
    including attempts with valid credentials (TC-08/TC-09).
- `POST /api/logout` — destroys the session and clears the cookie.

Failure counters and locks are tracked per login, including unregistered ones
(TC-11). A successful login resets the counter (TC-03). A lock of one login does
not affect others (TC-10).

## Test hooks (for Playwright fixtures)

- `POST /__test__/reset` — clears all counters, locks and sessions.
  Call in test setup for isolation.
- `POST /__test__/expire-locks` — expires every active lock immediately,
  simulating "15 minutes have passed" for TC-09 without real waiting.

## Selectors (stable `data-testid`)

| Element                    | `data-testid`     |
| -------------------------- | ----------------- |
| Login page root            | `login-page`      |
| Form                       | `login-form`      |
| «Логин» input              | `login-input`     |
| «Пароль» input             | `password-input`  |
| Error under «Логин»        | `login-error`     |
| Error under «Пароль»       | `password-error`  |
| Form error above «Войти»   | `form-error`      |
| «Войти» button             | `login-submit`    |
| Main page root             | `home-page`       |
| Protected page root        | `dashboard-page`  |
| «Выйти» button             | `logout-button`   |

Client-side validation («Введите логин» / «Введите пароль», focus management)
runs without sending a request, so a test can assert that no `/api/login`
request was fired (TC-04/TC-05).
