import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test.beforeAll(async ({ request }) => {
  const sample = await request.post("/api/sample/import");
  expect(sample.ok()).toBeTruthy();
  const original = path.resolve(
    import.meta.dirname,
    "../../Docs_for_info/public_emdat_custom_request_2026-09-29_c15f18a1-0997-403a-9ce3-b733ae1bf60c.xlsx",
  );
  const preview = await request.post("/api/disaster-uploads", {
    multipart: {
      file: {
        name: "emdat-real.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: fs.readFileSync(original),
      },
    },
  });
  expect(preview.ok()).toBeTruthy();
  const { token } = await preview.json();
  expect(
    (
      await request.post(`/api/disaster-uploads/${token}/commit`, {
        data: { name: "Катастрофи України · перевірка" },
      })
    ).ok(),
  ).toBeTruthy();
});

test("real climate normals, heatmap, monthly filters, CSV/XLSX/SVG and shareable state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?page=analytics");
  await page.getByText("Статистика та якість даних", { exact: true }).click();
  await expect(
    page.getByText("Підтверджена 30-річна база 1991–2020.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".analysis-heatmap tbody tr")).toHaveCount(26);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSX", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("obrii-climate.xlsx");
  const svg = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Експорт SVG: спостереження та історична норма",
      exact: false,
    })
    .count();
  await page
    .locator(".analysis-chart")
    .first()
    .getByRole("button", { name: /Експорт SVG/ })
    .click();
  expect((await svg).suggestedFilename()).toBe("obrii-chart.svg");
  await page.getByLabel("Аналітичний показник").selectOption("precipitation");
  await expect(
    page.getByRole("heading", {
      name: "Відхилення опадів від норми",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Аналітичний початок").fill("2020-01");
  await expect(page.locator(".analysis-heatmap tbody tr")).toHaveCount(6);
  await page.reload();
  await expect(page.getByLabel("Аналітичний початок")).toHaveValue("2020-01");
  await expect(page.locator(".analysis-heatmap tbody tr")).toHaveCount(6);
  expect(errors).toEqual([]);
});

test("statistics aligns pairs, selectable matrix and missing normal stays unavailable", async ({
  page,
}) => {
  await page.goto("/?page=analytics&a_view=statistics");
  await expect(page.locator(".analysis-matrix tbody tr")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Температура та Опади", exact: true })
    .click();
  await expect(page.getByLabel("Показник X")).toHaveValue("temperature");
  await expect(page.getByLabel("Показник Y")).toHaveValue("precipitation");
  await expect(page.locator(".result-summary")).toContainText(
    "Кореляція не доводить причинності",
  );
  await page.getByRole("button", { name: "Аномалії", exact: true }).click();
  await page.getByRole("button", { name: /Додаткові налаштування/ }).click();
  await page.getByLabel("Початок кліматичної бази").fill("1951");
  await page.getByLabel("Кінець кліматичної бази").fill("1980");
  await page.getByText("Статистика та якість даних", { exact: true }).click();
  await expect(
    page.getByText(/повну стандартну 30-річну норму не підтверджено/),
  ).toBeVisible();
});

test("forecast is explicit, validates historical test block, exports calculated results", async ({
  page,
}) => {
  let count = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/analytics/forecast")) count++;
  });
  await page.goto("/?page=analytics&a_view=forecast");
  await expect(
    page.getByRole("button", { name: "Розрахувати", exact: true }),
  ).toBeEnabled();
  expect(count).toBe(0);
  await page.getByRole("button", { name: "Розрахувати", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Часове розділення даних" }),
  ).toBeVisible();
  await expect(page.getByText(/2024-01 — 2025-12/).first()).toBeVisible();
  await expect(page.locator(".analysis-table tbody tr")).toHaveCount(12);
  const response = page.waitForResponse((r) =>
    r.url().includes("/analytics/export/xlsx?view=forecast"),
  );
  const file = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSX", exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await file;
  await page.getByRole("button", { name: /Додаткові налаштування/ }).click();
  await page.getByLabel("Горизонт прогнозу").fill("6");
  await expect(page.locator(".analysis-table")).toHaveCount(0);
});

test("comparison and real natural hazard indicator, no unsupported risk claims", async ({
  page,
}) => {
  await page.goto("/?page=analytics&a_view=comparison");
  await page.getByRole("button", { name: "Розрахувати", exact: true }).click();
  await expect(
    page.getByText(/Порівнюються 312 однакових/).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Небезпека", exact: true }).click();
  await expect(page.getByLabel("Каталог індикатора небезпеки")).toBeVisible();
  await page.getByRole("button", { name: "Розрахувати", exact: true }).click();
  await expect(
    page.getByText(/Історичний індикатор небезпеки, не повний ризик/),
  ).toBeVisible();
  await expect(page.locator(".analysis-table tbody tr")).toHaveCount(27);
});

test("mobile and tablet analytical layouts, API errors do not leave stale charts", async ({
  page,
}) => {
  await page.goto("/?page=analytics");
  await expect(page.locator(".analysis-heatmap")).toBeVisible();
  for (const width of [390, 768, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.route("**/api/analytics/report", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Тимчасово недоступні дані" }),
    }),
  );
  await page.getByLabel("Аналітичний початок").fill("2010-01");
  await expect(page.getByRole("alert")).toContainText(
    "Тимчасово недоступні дані",
  );
  await expect(page.locator(".analysis-heatmap")).toHaveCount(0);
});

test("personal climate history and methodology are accessible and sourced", async ({
  page,
}) => {
  await page.goto("/?page=analytics&a_view=history");
  await expect(
    page.getByRole("heading", { name: "Історія: Україна" }),
  ).toBeVisible();
  await expect(
    page.locator(".analysis-report").getByText(/Від 2000 до 2025 різниця/),
  ).toBeVisible();
  await expect(page.getByLabel("Аналітичний сезон")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Середньорічна температура та тренд" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Методологія", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Методологія та джерела даних",
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "Визначення ВМО ↗" }),
  ).toHaveAttribute("href", /wmo/);
});
