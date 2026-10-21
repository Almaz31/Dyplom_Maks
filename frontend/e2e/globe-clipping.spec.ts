import {test,expect} from '@playwright/test';

test('land crossing the horizon fills the visible cap and leaves the ocean clear',async({page})=>{
 // At the initial longitude (25°), this rectangle crosses the 90° horizon.
 // Dropping hidden vertices collapses its visible part into a line.
 await page.route('**/world-land.geojson',route=>route.fulfill({json:{type:'FeatureCollection',features:[{
  type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[65,-25],[65,25],[145,25],[145,-25],[65,-25]]]}
 }]}}));
 await page.goto('/?page=disasters');await page.getByRole('button',{name:'Світ',exact:true}).click();
 await page.getByRole('button',{name:'Погода',exact:true}).click();
 await page.getByLabel('Показник світової погоди').selectOption('anomaly');
 const canvas=page.locator('canvas');await expect(canvas).toBeVisible();
 const sample=()=>canvas.evaluate(el=>{
  const c=el as HTMLCanvasElement,ctx=c.getContext('2d')!,dpr=devicePixelRatio;
  const r=Math.min(c.clientWidth*.43,c.clientHeight*.43);
  const read=(offset:number)=>Array.from(ctx.getImageData(Math.round((c.clientWidth/2+r*offset)*dpr),Math.round(c.clientHeight/2*dpr),1,1).data);
  return {land:read(Math.sin(Math.PI/3)),ocean:read(0)};
 });
 await expect.poll(async()=>{const p=await sample();return p.land[1]>p.land[2]&&p.ocean[2]>p.ocean[1];}).toBeTruthy();
 // A full turn must return to exactly the same geographic view.
 const before=await sample();await canvas.focus();for(let i=0;i<36;i++)await canvas.press('ArrowRight');
 await expect.poll(sample).toEqual(before);
});
