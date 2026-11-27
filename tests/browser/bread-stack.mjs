import assert from 'node:assert/strict';
import {breadStackMessage} from '../../src/shared/bread-stack.js';
import {emptyRecipe} from '../../src/shared/recipe.js';

export async function checkBreadStack(browser,base){
  const page=await browser.newPage({viewport:{width:900,height:720}});
  try{
    const pieces=Array.from({length:8},()=>({food:'tas-kapak',x:0,z:0,a:0}));
    await page.addInitScript(recipe=>{
      const key='sofra.simit.workbench.v2';
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(recipe));
    },{...emptyRecipe('tas-ekmek'),pieces});
    await page.goto(base.href);
    const ready=()=>page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).ready);
    await ready();
    const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
    const add=id=>page.locator('[data-food="'+id+'"]').click();
    await add('pogaca-kapak');
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).pieces.length===9);
    await add('tas-kapak');
    await page.waitForFunction(msg=>document.querySelector('#coach').textContent===msg,breadStackMessage);
    assert.equal((await state()).pieces.length,9);
    await page.locator('#lid').click();
    assert.equal((await state()).closed,false);
    await page.locator('#shutter').click();
    const cover=page.locator('#photo-cover');
    for(const mode of ['full','half']){
      await cover.selectOption(mode);
      assert.equal(await cover.inputValue(),'table');
      assert.equal((await state()).photoCover,'side');
      assert.equal(await page.locator('#coach').textContent(),breadStackMessage);
    }
    await page.locator('#back').click();
    await add('kasar');
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).pieces.at(-1)?.food==='kasar');
    await page.locator('#undo-action').click();
    await page.locator('#undo-action').click();
    assert.equal((await state()).pieces.length,8,'a refused bread leaves no undo entry');
    await page.locator('#lid').click();
    assert.equal((await state()).closed,true,'matching top can be the tenth layer');
    const tower=[...pieces,pieces[0]],extra={...pieces[0],x:.99};
    const load=async recipe=>{
      await page.evaluate(r=>localStorage.setItem('sofra.simit.workbench.v2',JSON.stringify(r)),recipe);
      await page.reload();await ready();
    };
    await load({...emptyRecipe('tas-ekmek'),pieces:[...tower,extra],editSelection:9});
    await page.locator('#scene').press('ArrowLeft');
    assert.equal(await page.locator('#coach').textContent(),breadStackMessage);
    assert.equal((await state()).pieces[9].x,.99,'a rejected move leaves the spare in place');
    await page.locator('#scene').press('ArrowRight');
    assert.equal((await state()).pieces[9].x,1.01,'the separate bread remains movable');
    await load({...emptyRecipe('tas-ekmek'),baseRemoved:true,pieces:[...tower,pieces[0]]});
    await page.locator('#fresh').click();await page.locator('#toggle-base').click();
    assert.equal((await state()).baseRemoved,true,'restoring the base would make eleven');
    assert.equal(await page.locator('#coach').textContent(),breadStackMessage);
    await load({...emptyRecipe('tas-ekmek'),coverRemoved:true,pieces:tower});
    await add('tas-kapak');
    assert.equal((await state()).coverRemoved,true,'restoring the top from the shelf would make eleven');
    await page.evaluate(r=>{location.hash='simit='+btoa(JSON.stringify(r));},{...emptyRecipe('tas-ekmek'),closed:true,pieces:tower});
    const accept=page.locator('#import-recipe');await accept.waitFor();
    assert.equal(await accept.isDisabled(),true,'oversized shared stacks can be previewed');
    await page.locator('#keep-draft').click();
    assert.equal((await state()).coverRemoved,true);
    console.log('Bread stack: tenth layer, separate bread, move, lid, base, photo overlays, filling, undo and shared import passed.');
  }finally{await page.close();}
}
