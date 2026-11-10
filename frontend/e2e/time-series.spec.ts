import {test,expect} from '@playwright/test';

test('regional decomposition uses real monthly data, changes metric and clears stale results',async({page})=>{
 await page.goto('/?page=analytics&analysis=time-series&ts_start=2000-01');
 await expect(page.getByRole('heading',{name:'Тренд і складові часового ряду'})).toBeVisible();
 await expect(page.getByLabel('Область часового ряду')).toHaveValue('Львівська');
 await page.getByRole('button',{name:'Розрахувати розклад',exact:true}).click();
 await expect(page.getByText('312 із 312 повних місяців.',{exact:false})).toBeVisible({timeout:60000});
 await expect(page.getByRole('heading',{name:'Циклічна компонента',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Автокореляція випадкової компоненти',exact:true})).toBeVisible();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Завантажити складові CSV'}).click();
 expect((await download).suggestedFilename()).toContain('UA-46-temperature');
 await page.getByLabel('Показник часового ряду').selectOption('precipitation');
 await expect(page.getByRole('heading',{name:'Циклічна компонента',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Розрахувати розклад',exact:true}).click();
 await expect(page.getByText('312 із 312 повних місяців.',{exact:false})).toBeVisible();
 await expect(page.locator('.analysis-report h3')).toContainText('Опади');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'Аномалії',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Тренд і складові часового ряду'})).toHaveCount(0);
});

test('quota errors explain the limitation and allow selecting local history',async({page})=>{
 await page.route('**/api/time-series/report',route=>route.fulfill({status:429,json:{detail:'Open-Meteo: погодинний ліміт завантаження.'}}));
 await page.goto('/?page=analytics&analysis=time-series');
 await page.getByRole('button',{name:'Розрахувати розклад',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('погодинний ліміт');
 await page.getByRole('button',{name:'Обрати локальний період 2000–2025'}).click();
 await expect(page.getByLabel('Початок часового ряду')).toHaveValue('2000-01');
 await expect(page.getByRole('alert')).toHaveCount(0);
});
