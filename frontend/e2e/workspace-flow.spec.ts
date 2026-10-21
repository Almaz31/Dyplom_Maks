import { test, expect } from "@playwright/test";

test("a dataset opens in Ukraine and weather filters survive navigation, Back and reload", async ({
  page,
}) => {
  await page.goto("/?page=datasets&scope=world");
  await page
    .locator(".dataset-source .dataset-row")
    .first()
    .getByRole("button", { name: "Дослідити", exact: true })
    .click();
  await expect(page).toHaveURL(/scope=ukraine/);
  await expect(page.locator(".workspace")).toBeVisible();
  const dataset = await page.getByLabel("Активний датасет").inputValue();
  await page.getByLabel("Область", { exact: true }).selectOption("UA-51");
  await page.getByLabel("Початок періоду", { exact: true }).fill("2024-01-01");
  await page
    .getByRole("navigation", { name: "Головна навігація" })
    .getByRole("button", { name: /^Дані/ })
    .click();
  await page.goBack();
  await expect(page.getByLabel("Активний датасет")).toHaveValue(dataset);
  await expect(page.getByLabel("Область", { exact: true })).toHaveValue(
    "UA-51",
  );
  await expect(page.getByLabel("Початок періоду", { exact: true })).toHaveValue(
    "2024-01-01",
  );
  await page.reload();
  await expect(page.getByLabel("Область", { exact: true })).toHaveValue(
    "UA-51",
  );
  await expect(page.getByLabel("Початок періоду", { exact: true })).toHaveValue(
    "2024-01-01",
  );
});

test("the country reset clears the region and disaster filters are restored", async ({
  page,
}) => {
  await page.goto("/?page=disasters");
  await page
    .getByLabel("Територія катастроф", { exact: true })
    .selectOption("UA-46");
  await expect(page.locator(".disaster-region-marker").first()).toBeVisible();
  await page.locator(".map-reset").click();
  await expect(
    page.getByLabel("Територія катастроф", { exact: true }),
  ).toHaveValue("all");
  await expect(page.locator(".disaster-region-marker")).toHaveCount(0);
  await page
    .getByLabel("Тип катастрофи", { exact: true })
    .selectOption("Flood");
  await page
    .getByRole("navigation", { name: "Головна навігація" })
    .getByRole("button", { name: "Головна", exact: true })
    .click();
  await page.goBack();
  await expect(page.getByLabel("Тип катастрофи", { exact: true })).toHaveValue(
    "Flood",
  );
  await page.reload();
  await expect(page.getByLabel("Тип катастрофи", { exact: true })).toHaveValue(
    "Flood",
  );
});

test("mobile results come before collapsed filters and advanced controls remain accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?page=disasters");
  await expect(page.locator(".result-summary")).toContainText(
    "81 унікальна подія",
  );
  await expect(page.locator(".disaster-filters")).toBeHidden();
  expect(
    await page
      .locator(".map-panel")
      .evaluate((node) => node.getBoundingClientRect().top),
  ).toBeLessThan(900);
  await page.getByRole("button", { name: /Фільтри ·/ }).click();
  await expect(
    page.getByLabel("Тип катастрофи", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Фільтри ·/ }).click();
  await page
    .getByRole("button", { name: "Усі наслідки та повнота даних" })
    .click();
  await expect(page.locator(".impact-grid article").last()).toBeVisible();
  await page.goto("/?page=analytics");
  await expect(page.locator(".result-summary")).toBeVisible();
  await expect(page.getByLabel("Аналітичне джерело")).toBeHidden();
  await page
    .getByRole("button", { name: /Фільтри та параметри аналізу/ })
    .click();
  await expect(page.getByLabel("Аналітичне джерело")).toBeVisible();
  await expect(page.getByLabel("Початок кліматичної бази")).toBeHidden();
  await page.getByRole("button", { name: /Додаткові налаштування/ }).click();
  await expect(page.getByLabel("Початок кліматичної бази")).toBeVisible();
});

test("automatic calculations have no redundant submit action and preserve shared filter state", async ({
  page,
}) => {
  await page.goto("/?page=analytics");
  await expect(page.locator(".result-summary")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Перерахувати", exact: true }),
  ).toHaveCount(0);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/analytics/report") &&
      r.request().postDataJSON()?.metric === "precipitation",
  );
  await page.getByLabel("Аналітичний показник").selectOption("precipitation");
  expect((await response).ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", {
      name: "Відхилення опадів від норми",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Головна навігація" })
    .getByRole("button", { name: "Головна", exact: true })
    .click();
  await page.goBack();
  await expect(page.getByLabel("Аналітичний показник")).toHaveValue(
    "precipitation",
  );
  await page.reload();
  await expect(page.getByLabel("Аналітичний показник")).toHaveValue(
    "precipitation",
  );
});
