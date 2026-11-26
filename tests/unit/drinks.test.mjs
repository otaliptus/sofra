import assert from 'node:assert/strict';
import test from 'node:test';
import { ingredients, emptyRecipe, recipeFromHash } from '../../src/shared/recipe.js';

test('the drink shelf keeps the new servings with tea and preserves their poses in shared recipes', () => {
  const drinks=ingredients.filter(item=>item.drink);
  assert.deepEqual(drinks.map(item=>item.id),['cay','ayran','portakal-suyu','visne-suyu','kayisi-suyu','cilekli-sut','cikolatali-sut','muzlu-sut','kahve','turk-kahvesi']);
  const pieces=drinks.map((drink,i)=>({food:drink.id,x:1.45,z:-1.2,a:i/2,dem:0,water:0}));
  const draft={...emptyRecipe('tas-ekmek'),closed:true,pieces};
  const shared=recipeFromHash('#simit='+btoa(JSON.stringify(draft)));
  assert.equal(shared.closed,true);
  assert.deepEqual(shared.pieces,pieces);
});

test('a shared breakfast preserves each peeled lid and inserted straw independently',()=>{
  const serving=(food,prepared)=>({food,prepared,x:0,z:0,a:0});
  const pieces=[serving('ayran',true),serving('ayran'),serving('visne-suyu',true),
    serving('muzlu-sut',true),serving('muzlu-sut',false),serving('cay',true),serving('cilekli-sut','true')];
  const restored=recipeFromHash('#simit='+btoa(JSON.stringify({...emptyRecipe(),pieces})));
  assert.equal(restored.pieces[0].peel,50);
  assert.deepEqual(restored.pieces.map(p=>p.prepared),[undefined,undefined,true,true,undefined,undefined,undefined]);
});

test('each ayran keeps its peel amount through repeated recipe reads',()=>{
  const pieces=[{peel:2},{peel:32},{peel:83.6},{peel:101},{peel:0,prepared:true},{peel:-1},
    {peel:'60'},{food:'portakal-suyu',peel:30,prepared:true},{food:'kahve',peel:61}]
    .map(p=>({food:'ayran',x:0,z:0,a:0,...p}));
  const shared=r=>recipeFromHash('#simit='+btoa(JSON.stringify(r)));
  const restored=shared({...emptyRecipe(),pieces});
  assert.deepEqual(restored.pieces.map(p=>p.peel),[2,32,84,100,undefined,undefined,undefined,undefined,undefined]);
  assert.equal(restored.pieces[7].prepared,true);
  assert.deepEqual(shared(restored),restored);
});
