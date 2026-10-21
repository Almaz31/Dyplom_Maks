import {test,expect} from '@playwright/test';

test('country names and highlights follow cities and clicks on the globe',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?page=disasters');await page.getByRole('button',{name:'Світ',exact:true}).click();
 await page.getByRole('button',{name:'Погода',exact:true}).click();
 await expect(page.locator('.globe-country-badge')).toHaveText('Україна');
 await expect(page.locator('.globe-view')).toHaveAttribute('data-country','UKR');
 await page.getByLabel('Місто світу').selectOption('3');
 await expect(page.getByLabel('Країна вибраної точки')).toHaveText('Японія');
 await expect(page.locator('.globe-view')).toHaveAttribute('data-country','JPN');
 await page.getByLabel('Місто світу').selectOption('4');
 await expect(page.getByLabel('Країна вибраної точки')).toHaveText('Австралія');
 await expect(page.locator('.globe-view')).toHaveAttribute('data-country','AUS');
 await expect.poll(()=>page.locator('canvas').evaluate(el=>{const c=el as HTMLCanvasElement,r=Math.min(c.clientWidth*.43,c.clientHeight*.43);const [red,green]=c.getContext('2d')!.getImageData(Math.round((c.clientWidth/2-r*.4)*devicePixelRatio),Math.round((c.clientHeight/2-r*.1)*devicePixelRatio),1,1).data;return red>green;})).toBeTruthy();
 await page.locator('.globe-view').screenshot({path:'test-results/country-australia.png'});
 // A point on the globe selects a country even in the NASA overview.
 await page.getByLabel('Показник світової погоди').selectOption('anomaly');
 const canvas=page.locator('canvas');await canvas.focus();
 // Default view 25° E, 15° N; four upward steps centre 25° E, 55° N (Lithuania).
 for(let i=0;i<4;i++)await canvas.press('ArrowUp');
 const box=await canvas.boundingBox();if(!box)throw Error('Missing globe');
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.globe-country-badge')).toHaveText('Литва');
 await expect(page.locator('.globe-view')).toHaveAttribute('data-country','LTU');
 await page.locator('.globe-view').screenshot({path:'test-results/country-lithuania.png'});
 await page.getByRole('button',{name:'Скинути вид'}).click();
 await canvas.press('ArrowRight');for(let i=0;i<3;i++)await canvas.press('ArrowUp');
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.globe-country-badge')).toHaveText('Україна');
 // Pacific Ocean, 145° W and 15° N: no country, no stale highlight.
 await page.getByRole('button',{name:'Скинути вид'}).click();
 for(let i=0;i<17;i++)await canvas.press('ArrowLeft');
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.globe-country-badge')).toHaveText('Океан / поза межами країн');
 await expect(page.locator('.globe-view')).toHaveAttribute('data-country','');
 expect(errors).toEqual([]);
});
