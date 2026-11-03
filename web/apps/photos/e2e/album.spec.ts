import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

const albumName = "Empty album";

test.beforeEach(async ({ page }) => {
    const id = randomUUID();
    const password = randomUUID();

    await page.goto("/signup");
    await page.getByLabel("Email address").fill(`photos-${id}@example.org`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("checkbox").press("Space");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Verification code 1").pressSequentially("123456");
    await page.getByRole("button", { name: "Do this later" }).click();
    await page.getByText("Continue with free plan", { exact: true }).click();
    await expect(page).toHaveURL(/\/gallery/);

    await page.getByRole("button", { name: "Albums", exact: true }).click();
    await page
        .getByRole("button", { name: "New album", exact: true })
        .first()
        .click();
    const dialog = page.getByRole("dialog", { name: "New album" });
    await dialog.getByLabel("Album name").fill(albumName);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(
        page.getByText("Album created", { exact: true }),
    ).toBeVisible();
});

test("an empty album survives a reload", async ({ page }) => {
    await page.reload();
    await page.getByRole("button", { name: "Albums", exact: true }).click();
    await expect(
        page.getByText(albumName, { exact: true }).first(),
    ).toBeVisible();
});

test("an album rename survives a reload", async ({ page }) => {
    const newName = "Renamed album";

    await page.getByText(albumName, { exact: true }).first().click();
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: "Edit details" }).click();

    const dialog = page.getByRole("dialog", { name: "Edit details" });
    await dialog.getByLabel("Album name").fill(newName);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expect(
        page.getByText(newName, { exact: true }).first(),
    ).toBeVisible();

    await page.reload();
    await expect(
        page.getByText(newName, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(albumName, { exact: true })).toHaveCount(0);
});
