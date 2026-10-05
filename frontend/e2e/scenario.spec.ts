import {test,expect} from '@playwright/test';

test('CSV → validation → map → timeline → calculation → download',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByRole('button',{name:'Завантажити CSV',exact:true}).click();
 await page.locator('input[type=file]').setInputFiles({name:'browser-smoke.csv',mimeType:'text/csv',buffer:Buffer.from('date,region,temperature,precipitation,humidity,wind\n2024-01-01,UA-46,10,2,50,3\n2024-02-01,UA-46,20,4,70,5\n2024-02-01,UA-51,30,0,60,4\nbad,UA-46,10,0,50,2\n')});
 await expect(page.getByText('Зіставте колонки')).toBeVisible();
 await page.getByLabel('Джерело',{exact:true}).fill('E2E automated fixture');
 await page.getByRole('button',{name:'Перевірити дані'}).click();
 await expect(page.getByText('Перевірку завершено')).toBeVisible();
 await expect(page.getByRole('button',{name:'Імпортувати й відкрити'})).toBeDisabled();
 await page.getByRole('dialog').getByRole('checkbox').check();
 await page.getByRole('button',{name:'Імпортувати й відкрити'}).click();
 await expect(page.locator('.main-stat strong')).toContainText('15');
 await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(27);

 await page.getByLabel('Таймлайн',{exact:true}).focus();await page.getByLabel('Таймлайн',{exact:true}).press('End');
 await expect(page.locator('.map-date')).toContainText('2024-02');
 await page.getByLabel('Область',{exact:true}).selectOption('UA-51');
 await expect(page.locator('.main-stat strong')).toContainText('30');
 const downloading=page.waitForEvent('download');await page.getByRole('link',{name:'Скачати вибірку CSV'}).click();
 const file=await downloading;expect(file.suggestedFilename()).toBe('weather-selection.csv');
 await page.reload();await page.getByRole('button',{name:'Дослідження',exact:true}).click();await expect(page.getByLabel('Активний датасет')).toContainText('browser-smoke');
 await page.getByLabel('Область',{exact:true}).selectOption('UA-07');
 await expect(page.getByText('Немає даних у вибраному періоді',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});

test('mobile layout has no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'Дослідження',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Погода'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});
