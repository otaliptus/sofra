import assert from 'node:assert/strict';
import test from 'node:test';
import { ingredients, emptyRecipe, recipeFromHash } from '../recipe.js';

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
  assert.deepEqual(restored.pieces.map(p=>p.prepared),[true,undefined,true,true,undefined,undefined,undefined]);
});
