import { test as base, type Page } from "@playwright/test";
import { createAccount, signUp } from "./account";

// Every test gets a unique account and Playwright's isolated browser context.
// The runner removes all backend data when the suite finishes.
export const test = base.extend<{ signedInPage: Page }>({
    signedInPage: async ({ page }, use) => {
        await signUp(page, createAccount());
        await use(page);
    },
});

export { expect } from "@playwright/test";
