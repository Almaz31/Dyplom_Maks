import {test,expect} from '@playwright/test';
import path from 'node:path';

test('full weather coverage for all 27 territories',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.locator('.topbar nav button').first()).toContainText('Катастрофи');
 await expect(page.locator('.disasters-page')).toBeVisible();
 await page.getByRole('button',{name:'Дослідження',exact:true}).click();
 const select=page.getByLabel('Активний датасет');
 await expect(select).toContainText('ERA5 · усі області · 2000–2025');
 await select.selectOption({label:'ERA5 · усі області · 2000–2025'});
 await page.getByLabel('Область',{exact:true}).selectOption('UA-07');
 await expect(page.locator('.main-stat strong')).not.toContainText('…');
 expect(await page.getByLabel('Область',{exact:true}).locator('option').count()).toBe(27);
 expect(await page.getByLabel('Область',{exact:true}).textContent()).not.toContain('немає даних');
 await page.getByLabel('Область',{exact:true}).selectOption('UA-40');
 await expect(page.locator('.main-stat strong')).not.toContainText('…');
 await page.getByRole('button',{name:'Увесь період',exact:true}).click();
 await expect(page.locator('.disaster-region-marker,.disaster-coordinate-marker,.event-legend')).toHaveCount(0);
 await expect(page.getByLabel('Шар катастроф',{exact:false})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('real EM-DAT Excel import, metrics, filters, timeline and export',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'EM-DAT Excel',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles(path.resolve('../../public_emdat_custom_request_2026-09-29_c15f18a1-0997-403a-9ce3-b733ae1bf60c.xlsx'));
 await expect(page.getByText('Файл перевірено',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Імпортувати катастрофи',exact:true}).click();
 await expect(page.locator('.impact-grid article').first()).toContainText('81');
 await expect(page.locator('.events-table-panel tbody tr')).toHaveCount(81);
 await expect(page.locator('.disaster-region-marker')).not.toHaveCount(0);
 await page.getByLabel('Тип катастрофи',{exact:true}).selectOption('Flood');
 await expect(page.locator('.impact-grid article').first()).toContainText('12');
 await expect(page.locator('.events-table-panel tbody tr')).toHaveCount(12);
 await page.getByLabel('Таймлайн катастроф').focus();await page.getByLabel('Таймлайн катастроф').press('End');
 await expect(page.locator('.disaster-map-layout .map-panel h3')).toContainText('2025');
 await expect(page.locator('.events-table-panel tbody tr')).toHaveCount(1);
 await expect(page.getByLabel('Легенда катастроф').locator('button')).toHaveCount(1);
 const legend=page.getByLabel('Легенда катастроф').locator('[data-disaster-type="Flood"]');
 await expect(legend).toContainText('Повінь');
 await expect(legend.locator('b')).toHaveText('1');
 const symbol=page.locator('.disaster-type-marker [data-disaster-type="Flood"]').first();
 await expect(symbol).toBeVisible();
 expect(await symbol.locator('path').getAttribute('d')).toBe(await legend.locator('path').getAttribute('d'));
 await page.locator('.events-table-panel').getByRole('button',{name:'Повінь',exact:true}).click();
 await expect(page.locator('.disaster-detail')).toContainText('2025-0848-UKR');
 await expect(page.locator('.disaster-detail')).toContainText('Одеська');
 await expect(legend).toBeVisible();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('link',{name:'Експорт періоду CSV',exact:true}).click();
 expect((await downloadPromise).suggestedFilename()).toBe('disasters-selection.csv');
 await page.getByRole('button',{name:'Усі роки',exact:true}).click();
 await expect(legend.locator('b')).toHaveText('12');
 await page.getByLabel('Тип катастрофи',{exact:true}).selectOption('');
 await page.getByLabel('Територія катастроф',{exact:true}).selectOption('UA-46');
 await expect(page.locator('.events-table-panel tbody tr')).not.toHaveCount(81);
 expect(errors).toEqual([]);
});

test('disaster map and metrics fit mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:/^Катастрофи/}).click();
 await expect(page.locator('.impact-grid article').first()).toContainText('81');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'test-results/disasters-mobile.png',fullPage:true});
});
