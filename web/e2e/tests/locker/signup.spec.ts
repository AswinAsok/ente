import { expect, test } from "../../fixtures/test";

test("signs up and opens Locker", async ({ signedInPage: page }) => {
    await expect(page).toHaveURL(/\/locker$/);
    await expect(
        page.getByText("Your Locker is empty", { exact: true }),
    ).toBeVisible();
});
