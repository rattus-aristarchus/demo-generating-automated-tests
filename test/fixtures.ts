import {
  test as base,
  request,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

/** Shape of the state returned by storageState() (cookies + origins). */
type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;

/**
 * Role fixtures with API-based login.
 *
 * Login is performed once per worker per role via POST /api/login
 * (see app/server.js); the resulting session cookie is captured as
 * storage state and reused by every test, so specs never contain
 * login logic themselves.
 *
 * The demo server has no role model: "admin" is mapped to the second
 * seeded account as a placeholder. When real roles appear, only the
 * CREDENTIALS table below needs to change.
 */

const baseURL =
  process.env.BASE_URL ??
  `http://${process.env.HOST ?? "127.0.0.1"}:${process.env.PORT ?? "7100"}`;

// Accounts seeded in app/server.js.
const CREDENTIALS = {
  newUser: { login: "alice", password: "password123" },
  admin: { login: "carol", password: "password456" },
} as const;

type ApiRole = keyof typeof CREDENTIALS;

/**
 * Authenticate via the API and return the captured storage state
 * (the `sid` session cookie). Uses a short-lived request context,
 * disposed immediately after the state is extracted.
 */
async function apiLogin(role: ApiRole): Promise<StorageState> {
  const api = await request.newContext({ baseURL });
  try {
    const response = await api.post("/api/login", {
      data: CREDENTIALS[role],
    });
    if (!response.ok()) {
      throw new Error(
        `API login as ${role} failed: ${response.status()} ${await response.text()}`,
      );
    }
    return await api.storageState();
  } finally {
    await api.dispose();
  }
}

/** Build an isolated page from a browser and an optional storage state. */
async function pageWithState(
  browser: Browser,
  storageState?: StorageState,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL, storageState });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

type WorkerFixtures = {
  newUserState: StorageState;
  adminState: StorageState;
};

type RoleFixtures = {
  /** Authenticated regular user (alice). */
  newUserPage: Page;
  /** Authenticated admin (carol — placeholder, see note above). */
  adminPage: Page;
  /** Unauthenticated visitor: a fresh context with no session cookie. */
  guestPage: Page;
};

export const test = base.extend<RoleFixtures, WorkerFixtures>({
  // Worker-scoped: one API login per role per worker, reused by all tests.
  newUserState: [
    async ({}, use) => {
      await use(await apiLogin("newUser"));
    },
    { scope: "worker" },
  ],
  adminState: [
    async ({}, use) => {
      await use(await apiLogin("admin"));
    },
    { scope: "worker" },
  ],

  // Page-scoped: every test gets a fresh, isolated browser context.
  newUserPage: async ({ browser, newUserState }, use) => {
    const { page, close } = await pageWithState(browser, newUserState);
    await use(page);
    await close();
  },
  adminPage: async ({ browser, adminState }, use) => {
    const { page, close } = await pageWithState(browser, adminState);
    await use(page);
    await close();
  },
  guestPage: async ({ browser }, use) => {
    const { page, close } = await pageWithState(browser);
    await use(page);
    await close();
  },
});

export { expect } from "@playwright/test";
