import { expect, test } from "@playwright/test";

// The web login: hitome's own server checks the login with the calendar
// server (the throwaway Radicale's test / test account) and keeps it; the
// browser only gets a cookie it cannot read. Starts logged out, unlike the
// other specs, which reuse the session globalSetup saved.
test.use({ storageState: { cookies: [], origins: [] } });

test("log in, log out", async ({ page }) => {
  await test.step("logged out → the login screen, and no calendar", async () => {
    await page.goto("/");
    await expect(page.getByTestId("login-screen")).toBeVisible({
      timeout: 30_000,
    });
    const dav = await page.request.fetch("/dav/", { method: "PROPFIND" });
    expect(dav.status()).toBe(401);
    // No challenge: the browser must never show its own password box.
    expect(dav.headers()["www-authenticate"]).toBeUndefined();
  });

  await test.step("a wrong password is refused, and the field cleared", async () => {
    await page.getByTestId("login-username").fill("test");
    await page.getByTestId("login-password").fill("not-the-password");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-problem")).toContainText(
      "weren’t accepted",
    );
    await expect(page.getByTestId("login-password")).toHaveValue("");
  });

  await test.step("the right one opens the calendar", async () => {
    await page.getByTestId("login-password").fill("test");
    await page.getByTestId("login-password").press("Enter");
    await expect(page.getByTestId("month-grid")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("login-screen")).toHaveCount(0);
    // The cookie is httpOnly: page code cannot read it.
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "hitome_session",
    );
  });

  await test.step("staying logged in across a reload", async () => {
    await page.reload();
    await expect(page.getByTestId("month-grid")).toBeVisible({
      timeout: 30_000,
    });
  });

  await test.step("Settings → Log out → back to the login screen", async () => {
    await page.goto("/settings");
    await expect(page.getByTestId("settings-username")).toContainText("test");
    await page.getByTestId("settings-logout").click();
    await expect(page.getByTestId("login-screen")).toBeVisible();
    const dav = await page.request.fetch("/dav/", { method: "PROPFIND" });
    expect(dav.status()).toBe(401);
  });
});
