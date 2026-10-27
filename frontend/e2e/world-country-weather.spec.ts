import {test,expect} from '@playwright/test';

test('world weather has one country search and selects countries without city labels',async({page,request})=>{
 const raw=await (await request.get('/api/world/weather?latitude=50.45&longitude=30.52')).json();
 await page.route('**/api/world/weather?*',route=>route.fulfill({json:raw}));
 await page.goto('/?page=disasters');
 await page.getByRole('button',{name:'\u0421\u0432\u0456\u0442',exact:true}).click();
 await page.getByRole('button',{name:'\u041f\u043e\u0433\u043e\u0434\u0430',exact:true}).click();
 const search=page.locator('.world-hero').getByRole('combobox');
 await expect(search).toHaveCount(1);
 await expect(search).toBeEnabled();
 await search.fill('DEU');
 const option=page.getByRole('listbox').getByRole('option');
 await expect(option).toHaveCount(1);
 const name=await option.textContent();
 await option.click();
 await expect(page.locator('.world-intro h2')).toContainText(name!);
 await expect(page.locator('.globe-view')).toHaveAttribute('data-country','DEU');
 await expect(page.locator('.globe-view canvas')).not.toHaveAttribute('aria-description',/\u041a\u0438\u0457\u0432|\u041b\u043e\u043d\u0434\u043e\u043d|\u0422\u043e\u043a\u0456\u043e/);
});
