import {test,expect} from '@playwright/test';

test('wheel zoom stays inside the globe, including at the zoom limit',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/?page=disasters');await page.getByRole('button',{name:'Світ',exact:true}).click();
 await page.getByRole('button',{name:'Погода',exact:true}).click();
 await page.getByLabel('Показник світової погоди').selectOption('anomaly');
 await expect(page.getByRole('heading',{name:'Статистичний аналіз'})).toBeVisible();
 const canvas=page.locator('canvas');await canvas.scrollIntoViewIfNeeded();
 const alpha=()=>canvas.evaluate(el=>{const c=el as HTMLCanvasElement,r=Math.min(c.clientWidth*.43,c.clientHeight*.43);return c.getContext('2d')!.getImageData(Math.round((c.clientWidth/2+r*.85)*devicePixelRatio),Math.round(c.clientHeight/2*devicePixelRatio),1,1).data[3];});
 await expect.poll(alpha).toBe(255);
 const y=await page.evaluate(()=>scrollY),box=await canvas.boundingBox();if(!box)throw Error('Missing globe');
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.wheel(0,600);await expect.poll(alpha).toBe(0);
 expect(await page.evaluate(()=>scrollY)).toBe(y);
 await page.mouse.wheel(0,600);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 expect(await page.evaluate(()=>scrollY)).toBe(y);
 // Wheel events outside the globe must still scroll the page normally.
 await page.mouse.move(20,400);await page.mouse.wheel(0,400);
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(y);
 expect(errors).toEqual([]);
});
