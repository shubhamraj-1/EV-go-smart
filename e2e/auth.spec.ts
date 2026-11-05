import { expect, test } from "@playwright/test";

const UNIQU = Date.now();
const EMAIL = `e2e+${UNIQU}@test.local`;
const PASSWORD = "TestPass123456";
const NAME = "E2E User";

test.describe("auth flow", () => {
  test("protected routes redirect to sign-in when signed out", async ({ page }) => {
    await page.goto("/customer");
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  test("sign-up creates a session and redirects to customer home", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();

    await page.getByLabel("Full name").fill(NAME);
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/customer/, { timeout: 30_000 });
    await expect(page.getByText("Sign out")).toBeVisible();
  });

  test("sign-out returns to landing and protected route redirects again", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/customer/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await page.goto("/customer");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("header shows Sign in when signed out and dashboard link after sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute(
      "href",
      "/sign-in",
    );
    await expect(page.getByRole("link", { name: "Get help now" }).first()).toHaveAttribute(
      "href",
      "/sign-up",
    );

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page).toHaveURL(/customer/, { timeout: 30_000 });

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Open dashboard" })).toHaveAttribute(
      "href",
      "/customer",
    );
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });

  test("invalid sign-in shows an error and stays on sign-in", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill("WrongPass123456");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/sign-in/);
  });
});
