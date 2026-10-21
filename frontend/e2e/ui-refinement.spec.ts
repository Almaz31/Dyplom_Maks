import { test, expect } from "@playwright/test";

test("home, focused import, navigation history and disaster views", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Від даних — до розуміння змін" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Завантажити CSV", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .first()
    .getByRole("button", { name: /^Катастрофи/ })
    .click();
  await expect(page.locator(".impact-grid article").first()).toContainText(
    "81",
  );
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(27);
  await expect(
    page.locator(".disaster-region-marker,.disaster-coordinate-marker"),
  ).toHaveCount(0);
  await expect(page.locator(".disaster-statistics")).toHaveCount(0);
  await page
    .getByLabel("Територія катастроф", { exact: true })
    .selectOption("UA-46");
  await expect(page.locator(".disaster-region-marker").first()).toBeVisible();
  await page.getByRole("button", { name: "Статистика", exact: true }).click();
  await expect(page.locator(".disaster-statistics")).toBeVisible();
  await expect(page.locator(".disaster-map-layout")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Дані", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Завантажити CSV", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "EM-DAT Excel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Погодні набори", exact: false }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator(".disasters-page")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".home-page")).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile events are readable cards and main pages fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ["home", "disasters", "datasets", "analytics", "method"]) {
    await page.goto("/?page=" + view);
    await expect(page.locator("h1")).toBeVisible();
    if (view === "disasters") {
      await expect(page.locator(".mobile-event")).toHaveCount(10);
      await expect(page.locator(".desktop-events")).toBeHidden();
      await expect(
        page.locator(".mobile-event").first().getByRole("button"),
      ).toBeVisible();
      expect(
        await page
          .locator(".mobile-event p")
          .first()
          .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
      ).toBeGreaterThanOrEqual(14);
      await page.locator(".mobile-event").first().getByRole("button").click();
      await expect(page.locator(".disaster-detail")).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      view,
    ).toBeTruthy();
  }
});

test("forecast model stays available within analytics", async ({ page }) => {
  await page.goto("/?page=analytics&a_view=forecast");
  await page
    .getByRole("button", { name: "Прогноз на карті Європи", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Розрахувати прогноз", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
