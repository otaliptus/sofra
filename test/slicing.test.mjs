import assert from 'node:assert/strict';
import test from 'node:test';
import { cutServings, emptyRecipe, readRecipe } from '../recipe.js';

const pepper={food:'pepper',x:.25,z:.1,a:.61,dem:0,water:0};
test('pepper rings fan out along the rotated pepper, including its reflection',()=>{
  for(const [thickness,n] of [['thin',8],['regular',5],['thick',3]]){
    const cuts=cutServings(pepper,thickness);
    const mirrored=cutServings({...pepper,mirrored:true},thickness);
    assert.equal(cuts.length,n);
    assert.ok(cuts.every(p=>p.food==='pepper-ring'));
    assert.ok(cuts[0].taper);
    const cs=Math.cos(pepper.a),sn=Math.sin(pepper.a);
    cuts.forEach((p,i)=>{
      const q=mirrored[i];
      const x=(p.x-pepper.x)*cs-(p.z-pepper.z)*sn,mx=(q.x-pepper.x)*cs-(q.z-pepper.z)*sn;
      assert.ok(Math.abs(x+mx)<.002);
      assert.ok(q.mirrored);
    });
    assert.deepEqual(readRecipe({...emptyRecipe(),pieces:mirrored}).pieces,mirrored);
  }
});
test('whole olives cut into individual rings and changing thickness preserves seasoning',()=>{
  const mark={food:'pul-biber',line:[[120,382]]};
  const olive={...pepper,food:'green-olive',marks:[mark]};
  const rings=cutServings(olive,'regular');
  assert.equal(rings.length,3);
  assert.ok(rings.every(p=>p.food==='green-ring'));
  assert.equal(rings.flatMap(p=>p.marks||[]).length,1);
  assert.notEqual(rings[0].marks[0].line,mark.line);
  const slice={...pepper,food:'cucumber',marks:[mark]};
  assert.deepEqual(cutServings(slice,'thin'),[{...slice,thickness:'thin'}]);
  assert.deepEqual(cutServings({...slice,thickness:'thin'},'regular'),[slice]);
  assert.deepEqual(cutServings({...slice,food:'ayran'},'thin'),[]);
  const invalid=readRecipe({...emptyRecipe(),pieces:[{...slice,food:'cay',mirrored:true,thickness:'thick',taper:true}]});
  assert.deepEqual(invalid.pieces,[{...pepper,food:'cay'}]);
});
