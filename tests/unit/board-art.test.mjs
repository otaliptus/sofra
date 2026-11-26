import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {cloths,emptyRecipe,ingredients} from '../../src/shared/recipe.js';
import {art,foodArt,prepareArt,recipeArt} from '../../src/scene/board-art.js';

test('cold scenes request their own artwork, including saved marks and sliced ingredients',()=>{
  assert.deepEqual([...recipeArt(emptyRecipe())].sort(),
    ['kahvalti-tabagi','kareli-bezi','sesame-crust','simit-kapak','split-simit']);
  const breakfast={...emptyRecipe('acma','gazete'),strokes:[{food:'menemen'}],pieces:[
    {food:'cilekli-sut'},{food:'pepper',marks:[{food:'biber-salcasi'}]},{food:'pogaca-kapak'}
  ]};
  const ids=recipeArt(breakfast);
  for(const id of ['gazete-kagidi','kareli-bezi','acma-crust','pogaca-crust','milk-art','servings','serving-relief','pepper-ring','smear-biber-salcasi'])assert.ok(ids.has(id),id);
  assert.ok(!ids.has('drink-art'));
  for(const item of ingredients){
    const shelf=item.kind==='sauce'?'bottle-'+item.id:item.asset||item.id;
    assert.ok(existsSync(new URL('../../assets/thumbs/'+shelf+'.webp',import.meta.url)),shelf);
    for(const id of foodArt(item.id))assert.ok(existsSync(new URL('../../assets/'+id+'.webp',import.meta.url)),id);
  }
  for(const cloth of Object.values(cloths))assert.ok(existsSync(new URL('../../assets/thumbs/'+cloth.asset+'.webp',import.meta.url)));
});

test('only tea requests the baked reflections and its fallback survives a missing map',async t=>{
  t.after(()=>{delete art['tea-light'];});
  for(const food of ingredients)assert.equal(foodArt(food.id).includes('tea-light'),food.id==='cay');
  let calls=0;
  const unavailable=async()=>{calls++;throw Error('offline');};
  await Promise.all([prepareArt(['tea-light'],unavailable),prepareArt(['tea-light'],unavailable)]);
  assert.equal(art['tea-light'],null);
  assert.equal(prepareArt(['tea-light'],unavailable),null);
  assert.equal(calls,1);
});

test('concurrent requests share a decode, warm artwork is synchronous, failed requests can retry',async t=>{
  const calls=[];
  const original=Object.getOwnPropertyDescriptor(globalThis,'Image');
  globalThis.Image=class{
    decode(){return new Promise((resolve,reject)=>calls.push({url:this.src,resolve,reject}));}
  };
  t.after(()=>{if(original)Object.defineProperty(globalThis,'Image',original);else delete globalThis.Image;});
  const a=prepareArt(['tomato','tomato']),b=prepareArt(['tomato']);
  assert.equal(calls.length,1);calls[0].resolve();await Promise.all([a,b]);
  assert.equal(prepareArt(['tomato']),null);
  const failed=prepareArt(['cucumber']);calls[1].reject(Error('temporarily unavailable'));await assert.rejects(failed);
  const retry=prepareArt(['cucumber']);assert.equal(calls.length,3);calls[2].resolve();await retry;
  assert.equal(prepareArt(['cucumber']),null);
});
