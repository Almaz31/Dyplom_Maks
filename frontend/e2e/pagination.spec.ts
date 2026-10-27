import {test,expect} from '@playwright/test';

test('Ukraine event pagination changes rows and resets after filters and timeline',async({page})=>{
 await page.goto('/?page=disasters');const table=page.locator('.events-table-panel');
 await expect(table.locator('tbody tr')).toHaveCount(10);
 const first=await table.locator('tbody tr').first().textContent();
 await table.getByRole('button',{name:'Наступна сторінка'}).click();
 await expect(table.locator('.pagination-summary')).toHaveText('11–20 із 81 записів');
 expect(await table.locator('tbody tr').first().textContent()).not.toBe(first);
 await table.getByRole('button',{name:'Сторінка 9',exact:true}).click();
 await expect(table.locator('tbody tr')).toHaveCount(1);
 await expect(table.getByRole('button',{name:'Наступна сторінка'})).toBeDisabled();
 await table.getByLabel('Рядків на сторінці').selectOption('25');
 await expect(table.locator('tbody tr')).toHaveCount(25);
 await table.getByLabel('Рядків на сторінці').selectOption('10');
 await expect(table.locator('.pagination-summary')).toHaveText('1–10 із 81 записів');
 await table.getByRole('button',{name:'Наступна сторінка'}).click();
 await page.getByLabel('Тип катастрофи',{exact:true}).selectOption('Flood');
 await expect(table.locator('.pagination-summary')).toHaveText('1–10 із 12 записів');
 await table.getByRole('button',{name:'Наступна сторінка'}).click();
 await page.getByLabel('Тип катастрофи',{exact:true}).selectOption('');
 await expect(table.locator('.pagination-summary')).toHaveText('1–10 із 81 записів');
 await page.getByLabel('Тип катастрофи',{exact:true}).selectOption('Flood');
 await expect(table.locator('.pagination-summary')).toHaveText('1–10 із 12 записів');
 await table.getByRole('button',{name:'Наступна сторінка'}).click();
 await page.getByLabel('Таймлайн катастроф').focus();await page.getByLabel('Таймлайн катастроф').press('End');
 await expect(table.locator('.pagination-summary')).toHaveText('1–1 із 1 записів');
});

test('world event pagination keeps map totals and fits mobile',async({page})=>{
 await page.goto('/?page=disasters');await page.getByRole('button',{name:'Світ',exact:true}).click();
 const table=page.locator('.events-table-panel');await expect(table.locator('tbody tr')).toHaveCount(10);
 const count=await page.locator('.world-latest strong').textContent();
 await table.getByRole('button',{name:'Наступна сторінка'}).click();
 await expect(table.getByRole('button',{name:'Сторінка 2',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.locator('.world-latest strong')).toHaveText(count!);
 await page.getByLabel('Країна світових катастроф').fill('USA');
 await page.getByRole('listbox').getByRole('option').click();
 await expect(table.getByRole('button',{name:'Сторінка 1',exact:true})).toHaveAttribute('aria-current','page');
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});


test('globe country search focuses one country', async ({page}) => {
 await page.goto('/?page=disasters');
 await page.getByRole('button', {name:'\u0421\u0432\u0456\u0442',exact:true}).click();
 const search=page.locator('.globe-view').getByRole('combobox');
 await expect(search).toBeEnabled();
 await search.fill('UKR');
 await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
 await search.press('Enter');
 await expect(page.locator('.globe-view')).toHaveAttribute('data-country','UKR');
});
