import {test,expect} from '@playwright/test';

test('world weather switches all four measurements and locations',async({page,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'Світ',exact:true}).click();
 await page.getByRole('button',{name:'Дослідження',exact:true}).click();
 await expect(page.getByRole('button',{name:'Світ',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('Місто світу').selectOption('3');
 const raw=await (await request.get('/api/world/weather?latitude=35.68&longitude=139.69')).json();
 const metrics=[['temperature','Температура'],['precipitation','Опади'],['humidity','Вологість'],['wind','Вітер']];
 for(const [key,label] of metrics){
  await page.getByLabel('Показник світової погоди').selectOption(key);
  await expect(page.getByRole('heading',{name:`${label} · добові значення`})).toBeVisible();
  await expect(page.getByLabel('Погодна колірна шкала')).toHaveAttribute('data-metric',key);
  const values=raw.series.map((r:Record<string,number>)=>r[key]).filter((v:number|null)=>v!=null);
  const sum=values.reduce((s:number,v:number)=>s+v,0),value=key==='precipitation'?sum:sum/values.length;
  await expect(page.locator('.world-latest strong')).toContainText(new Intl.NumberFormat('uk-UA',{maximumFractionDigits:1}).format(value));
 }
 await page.getByLabel('Місто світу').selectOption('4');
 await expect(page.locator('.world-intro h2')).toContainText('Сідней');
 await expect(page.getByRole('heading',{name:'Вітер · добові значення'})).toBeVisible();
 await page.screenshot({path:'test-results/world-wind.png',fullPage:true});
 // Point selection issues a coordinate request, while dragging does not select.
 await page.route('**/api/world/weather?*',route=>route.fulfill({json:raw}));
 const canvas=page.locator('canvas');const box=await canvas.boundingBox();if(!box)throw Error('No globe');
 const response=page.waitForRequest(r=>r.url().includes('/api/world/weather?'));
 await page.mouse.click(box.x+box.width/2+45,box.y+box.height/2-30);await response;
 await expect(page.locator('.world-intro h2')).toContainText('Вибрана точка');
 expect(errors).toEqual([]);
});

test('world disasters filter the globe and open event details',async({page,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByRole('button',{name:'Світ',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Катастрофи світу',exact:true})).toBeVisible();
 await page.getByLabel('Країна світових катастроф').selectOption('USA');
 await page.getByLabel('Тип світових катастроф').selectOption('flood');
 const expected=await (await request.get('/api/world/disasters?start=2018&end=2018&country=USA&event_type=flood')).json();
 await expect(page.locator('.world-latest strong')).toHaveText(String(expected.count));
 await expect(page.locator('.events-table-panel tbody tr')).toHaveCount(expected.count);
 await page.locator('.events-table-panel tbody button').first().click();
 await expect(page.locator('.world-event-detail')).toContainText('Повінь');
 const canvas=page.locator('canvas'),box=await canvas.boundingBox();if(!box)throw Error('No globe');
 await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
 await expect(page.locator('.world-event-detail')).toContainText('United States');
 await page.screenshot({path:'test-results/world-disasters.png',fullPage:true});
 await page.getByRole('button',{name:'Дослідження',exact:true}).click();
 await expect(page.getByLabel('Показник світової погоди')).toBeVisible();
 await expect(page.getByRole('button',{name:'Світ',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(errors).toEqual([]);
});

test('world weather and disasters have no horizontal overflow on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Світ',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Типи світових катастроф'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'Дослідження',exact:true}).click();
 await page.getByLabel('Показник світової погоди').selectOption('humidity');
 await expect(page.getByRole('heading',{name:'Вологість · добові значення'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
