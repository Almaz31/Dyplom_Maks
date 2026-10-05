import {test,expect} from '@playwright/test';

test('weather values use the color scale and retain it across timeline frames',async({page})=>{
 let nextFrame=false;
 await page.route('**/api/datasets/*/map?*',route=>route.fulfill({json:{
  'UA-46':{value:nextFrame?35:-15,coverage:100},
  'UA-07':{value:10,coverage:100},
  'UA-40':{value:35,coverage:100},
 }}));
 await page.goto('/');
 await page.getByRole('button',{name:'Дослідження',exact:true}).click();
 const legend=page.getByLabel('Погодна колірна шкала');
 await expect(legend).toHaveAttribute('data-metric','temperature');
 await expect(legend).toContainText('°C');
 await expect(page.locator('path.weather-region[fill="#2454b8"]')).toHaveCount(1);
 await expect(page.locator('path.weather-region[fill="rgb(84,182,106)"]')).toHaveCount(1);
 await expect(page.locator('path.weather-region[fill="rgb(216,51,53)"]')).toHaveCount(1);
 nextFrame=true;
 await page.getByLabel('Таймлайн',{exact:true}).focus();
 await page.getByLabel('Таймлайн',{exact:true}).press('End');
 await expect(page.locator('path.weather-region[fill="rgb(216,51,53)"]')).toHaveCount(2);
 await expect(legend).toContainText('≤ -15');
 await expect(legend).toContainText('≥ 35');
 for(const [name,metric] of [['Опади','precipitation'],['Вологість','humidity'],['Вітер','wind']]){
  await page.locator('.metric-options').getByRole('button',{name:new RegExp(name)}).click();
  await expect(legend).toHaveAttribute('data-metric',metric);
  await expect(page.locator('.disaster-region-marker,.disaster-coordinate-marker')).toHaveCount(0);
  await expect(legend.locator('.weather-gradient')).toHaveAttribute('style',/linear-gradient/);
 }
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
