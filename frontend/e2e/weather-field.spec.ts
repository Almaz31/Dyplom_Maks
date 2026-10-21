import { test, expect } from "@playwright/test";
import { gridValue, type GlobeField } from "../src/globeField";

test("interpolation wraps the date line and never fills missing samples", () => {
  const field: GlobeField = {
    latitudes: [-45, 45],
    longitudes: [-135, -45, 45, 135],
    values: [0, 10, 20, 30, 40, 50, 60, 70],
    metric: "temperature",
    scale: [0, 70],
  };
  expect(gridValue(field, 0, 180)).toBe(35);
  expect(gridValue(field, 0, -180)).toBe(35);
  expect(gridValue(field, 0, 0)).toBe(35);
  expect(
    gridValue({ ...field, values: [null, 10, 20, 30, 40, 50, 60, 70] }, 0, 180),
  ).toBeNull();
  expect(
    gridValue(
      { ...field, values: [null, 10, 20, 30, 40, 50, 60, 70] },
      45,
      135,
    ),
  ).toBe(70);
});

test("global fields colour land and ocean, change with the metric, and clear on errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?page=explore&scope=world");
  const globe = page.locator(".globe-view");
  await expect(globe).toHaveAttribute("data-field", "temperature");
  const sample = () =>
    page.locator("canvas").evaluate((node) => {
      const c = node as HTMLCanvasElement,
        ctx = c.getContext("2d")!,
        r = Math.min(c.clientWidth * 0.43, c.clientHeight * 0.43);
      return Array.from(
        ctx.getImageData(
          Math.round((c.clientWidth / 2 + r * 0.3) * devicePixelRatio),
          Math.round((c.clientHeight / 2 - r * 0.25) * devicePixelRatio),
          1,
          1,
        ).data,
      );
    });
  const temperature = await sample();
  await page.getByLabel("Показник світової погоди").selectOption("humidity");
  await expect(globe).toHaveAttribute("data-field", "humidity");
  await expect.poll(sample).not.toEqual(temperature);
  for (const metric of ["precipitation", "wind"]) {
    await page.getByLabel("Показник світової погоди").selectOption(metric);
    await expect(globe).toHaveAttribute("data-field", metric);
  }
  await page.route("**/api/world/weather-grid?**", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Шар тимчасово недоступний" },
    }),
  );
  await page.getByLabel("Початок світової погоди").fill("2024-02-01");
  await expect(globe).toHaveAttribute("data-field", "");
  await expect(page.getByRole("alert")).toContainText(
    "Шар тимчасово недоступний",
  );
  expect(errors).toEqual([]);
});

test("territory search selects countries by name and supports keyboard comparison", async ({
  page,
}) => {
  await page.goto("/?page=analytics");
  const search = page.getByRole("combobox", { name: "Аналітична територія" });
  await expect(search).toHaveValue("Україна");
  await search.fill("львів");
  await page.getByRole("option").filter({ hasText: "Львів" }).first().click();
  await expect(search).toHaveValue("Поблизу міста Львів · Україна");
  await expect(page.locator(".result-summary")).toContainText(
    "Поблизу міста Львів",
  );
  await expect(search).not.toHaveValue(/°/);
  await search.fill("поль");
  await page.getByRole("option").filter({ hasText: "Польща" }).first().click();
  await expect(search).toHaveValue("Польща");
  await expect(page.locator(".result-summary")).toContainText("Польща");
  await search.fill("територія-якої-немає");
  await expect(
    page.getByText("Нічого не знайдено в цьому джерелі. Спробуйте іншу назву."),
  ).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("Польща");
  await page.getByRole("button", { name: "Порівняння", exact: true }).click();
  const second = page.getByRole("combobox", {
    name: "Порівняння: територія 2",
  });
  await second.fill("німеч");
  await second.press("Enter");
  await expect(second).toHaveValue("Німеччина");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Порівняння: територія 2" }),
  ).toHaveValue("Німеччина");
});
