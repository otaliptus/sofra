import assert from 'node:assert/strict';
import test from 'node:test';
import {breadStackMessage,exceedsBreadStack} from '../../src/shared/bread-stack.js';
import {breads,emptyRecipe,readRecipe} from '../../src/shared/recipe.js';
import {normalizePost} from '../../worker/index.js';

const piece=(food,x=0,z=0,a=0)=>({food,x,z,a});
const crowns=Object.values(breads).map(b=>b.crown);
const pile=(n,x=0,z=0)=>Array.from({length:n},(_,i)=>piece(crowns[i%crowns.length],x,z));
const post=recipe=>normalizePost({title:'Sofra',recipe,pose:{yaw:0,elevation:1}});

test('mixed bread layers share a limit; the base counts and fillings do not',()=>{
  const recipe={...emptyRecipe(),pieces:pile(9).flatMap(p=>[p,piece('kasar')])};
  assert.equal(exceedsBreadStack(recipe),false);
  assert.ok(post(recipe));
  recipe.pieces.push(piece('acma-kapak'));
  assert.equal(exceedsBreadStack(recipe),true);
  assert.throws(()=>post(recipe),{message:breadStackMessage});
  assert.ok(readRecipe(recipe),'older drafts remain readable');
  assert.equal(exceedsBreadStack({...recipe,baseRemoved:true}),false);
});

test('separate piles, including parallel narrow loaves, have independent limits',()=>{
  const row=z=>Array.from({length:10},()=>piece('tas-kapak',0,z));
  const recipe={...emptyRecipe(),baseRemoved:true,pieces:[...row(-.35),...row(.35)]};
  assert.equal(exceedsBreadStack(recipe),false);
  assert.ok(post(recipe));
  recipe.pieces.push(piece('tas-kapak',0,0,Math.PI/2));
  assert.equal(exceedsBreadStack(recipe),true,'a bread bridging either full stack is an eleventh layer');
});

test('a matching cover contributes a layer only where it is placed',()=>{
  const recipe={...emptyRecipe('tas-ekmek'),pieces:pile(9)};
  assert.equal(exceedsBreadStack(recipe),false);
  assert.equal(exceedsBreadStack({...recipe,closed:true}),true);
  assert.equal(exceedsBreadStack({...recipe,coverPose:{x:.08,z:.1,yaw:.5}}),true);
  assert.equal(exceedsBreadStack({...recipe,coverPose:{x:1.4,z:0,yaw:.5}}),false);
  assert.equal(exceedsBreadStack({...recipe,coverRemoved:true}),false);
  const beside={x:1.4,z:0,yaw:0},center={x:0,z:0,yaw:0};
  assert.throws(()=>post({...recipe,photoCover:'full'}),{message:breadStackMessage});
  assert.throws(()=>post({...recipe,coverPose:beside,photoCover:'custom',photoCoverPose:center}),{message:breadStackMessage});
  assert.ok(post({...recipe,photoCover:'custom',photoCoverPose:beside}));
  assert.ok(post({...recipe,coverPose:beside,photoCoverPose:center}),'table mode uses the table pose');
});
