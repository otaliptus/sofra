import assert from 'node:assert/strict';
import test from 'node:test';
import { ingredients, emptyRecipe, recipeFromHash } from '../recipe.js';

test('the drink shelf keeps the new servings with tea and preserves their poses in shared recipes', () => {
  const drinks=ingredients.filter(item=>item.drink);
  assert.deepEqual(drinks.map(item=>item.id),['cay','ayran','portakal-suyu','visne-suyu','kayisi-suyu','kahve','turk-kahvesi']);
  const pieces=drinks.map((drink,i)=>({food:drink.id,x:1.45,z:-1.2,a:i,dem:0,water:0}));
  const draft={...emptyRecipe('tas-ekmek'),closed:true,pieces};
  const shared=recipeFromHash('#simit='+btoa(JSON.stringify(draft)));
  assert.equal(shared.closed,true);
  assert.deepEqual(shared.pieces,pieces);
});
