import {test,expect} from '@playwright/test';

test('world scope loads real data, filters years and rotates the globe',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?page=disasters');await page.getByRole('button',{name:'Світ',exact:true}).click();
 await page.getByRole('button',{name:'Погода',exact:true}).click();
 await page.getByLabel('Показник світової погоди').selectOption('anomaly');
 await expect(page.getByRole('heading',{name:'Світова погода'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Статистичний аналіз'})).toBeVisible();
 await page.getByLabel('Початковий рік світу').selectOption('1880');
 await page.getByLabel('Кінцевий рік світу').selectOption('1880');
 await expect(page.locator('.world-latest strong')).toContainText('-0,2');
 await expect(page.locator('.calculation-grid article').filter({hasText:'Стандартне відхилення'}).locator('strong')).toContainText('0');
 const canvas=page.locator('canvas');await expect(canvas).toBeVisible();
 await canvas.focus();await canvas.press('ArrowRight');await canvas.press('+');
 const box=await canvas.boundingBox();if(!box)throw Error('Missing globe');
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+70,box.y+box.height/2+30);await page.mouse.up();
 await page.getByRole('button',{name:'Автообертання'}).click();await expect(page.getByRole('button',{name:'Зупинити',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Скинути вид'}).click();
 await page.screenshot({path:'test-results/world-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Україна',exact:true}).click();await expect(canvas).toHaveCount(0);
 await page.getByRole('button',{name:/^Катастрофи/}).click();
 await page.getByRole('button',{name:'Статистика',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Структура катастроф за типом'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Сезонність початку катастроф'})).toBeVisible();
 expect(errors).toEqual([]);
});

test('world analytics fit a mobile viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/?page=disasters');await page.getByRole('button',{name:'Світ',exact:true}).click();
 await page.getByRole('button',{name:'Погода',exact:true}).click();
 await page.getByLabel('Показник світової погоди').selectOption('anomaly');
 await expect(page.getByRole('heading',{name:'Статистичний аналіз'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:'test-results/world-mobile.png',fullPage:true});
});
