import { expect, type Page } from "@playwright/test";

export async function signUp(page: Page, email: string, password: string) {
    await page.getByRole("button", { name: "Signup", exact: true }).click();
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("checkbox").press("Space");
    await expect(page.getByRole("checkbox")).toBeChecked();
    await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
    const code = process.env.E2E_OTT;
    if (!code) throw new Error("Missing local Museum verification code");
    for (let index = 0; index < code.length; index++) {
        await page
            .getByLabel(`Verification code ${index + 1}`, { exact: true })
            .fill(code.charAt(index));
    }
    await page
        .getByRole("button", { name: "Do this later", exact: true })
        .click();
    await page.getByText("Continue with free plan", { exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Albums", exact: true }),
    ).toBeVisible();
}

export async function logIn(page: Page, email: string, password: string) {
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
        page.getByRole("button", { name: "Albums", exact: true }),
    ).toBeVisible();
}
