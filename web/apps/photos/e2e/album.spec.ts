import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { logIn, signUp } from "./account";
import { test } from "./fixtures";

test("creates an empty album that persists in a fresh session", async ({
    app,
}) => {
    const suffix = process.env.E2E_EMAIL_SUFFIX;
    if (!suffix) throw new Error("Missing local Museum email suffix");
    const id = randomUUID();
    const email = `photos-${id}${suffix}`;
    const password = `E2E-Album!${id}`;
    const album = `E2E album ${id}`;
    let page = await app.open();
    await signUp(page, email, password);
    await page.getByRole("button", { name: "Albums", exact: true }).click();
    await page
        .getByRole("button", { name: "New album", exact: true })
        .first()
        .click();
    const dialog = page.getByRole("dialog", { name: "New album", exact: true });
    await dialog.getByLabel("Album name", { exact: true }).fill(album);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
        page.getByRole("heading", { name: album, exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Nothing to see here", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Albums", exact: true }).click();
    await page
        .getByRole("button", { name: album, exact: true })
        .first()
        .click();
    await expect(
        page.getByText("Nothing to see here", { exact: true }),
    ).toBeVisible();

    page = await app.restart();
    await logIn(page, email, password);
    await page.getByRole("button", { name: "Albums", exact: true }).click();
    await page
        .getByRole("button", { name: album, exact: true })
        .first()
        .click();
    await expect(
        page.getByRole("heading", { name: album, exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText("Nothing to see here", { exact: true }),
    ).toBeVisible();
});
