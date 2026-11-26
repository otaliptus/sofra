import assert from 'node:assert/strict';
import test from 'node:test';
import {DoubleSide,Mesh,MeshBasicMaterial,Raycaster,TorusGeometry,Vector3} from 'three';
import {intersectStrips} from '../../src/scene/food-picker.js';

test('strip hits match a full mesh raycast across holes, mirrored poses and vertical deformation',()=>{
  const geometry=new TorusGeometry(1,.21,9,48);
  const mesh=new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide}));
  mesh.rotation.set(.24,.38,-.15);
  mesh.scale.x=-1;
  mesh.updateMatrixWorld();
  const positions=geometry.attributes.position;
  for(const draped of [false,true]){
    if(draped){
      for(let i=0;i<positions.count;i++){
        positions.setY(i,positions.getY(i)+.5*Math.cos(positions.getX(i)*2));
      }
      positions.needsUpdate=true;
      geometry.boundingBox=null;
      geometry.computeBoundingSphere();
    }
    let covered=0,empty=0;
    for(let x=-1.3;x<=1.3;x+=.13)for(let y=-1.4;y<1.6;y+=.15){
      const ray=new Raycaster(new Vector3(x,y,3),new Vector3(.04,-.02,-1).normalize());
      const expected=ray.intersectObject(mesh,false),actual=[];
      intersectStrips(ray,mesh,actual);
      assert.deepEqual(actual.map(h=>[h.faceIndex,h.distance,h.uv]),expected.map(h=>[h.faceIndex,h.distance,h.uv]));
      assert.ok(actual.every(h=>h.object===mesh));
      if(actual.length)covered++;else empty++;
    }
    assert.ok(covered>0&&empty>0);
    assert.deepEqual(geometry.drawRange,{start:0,count:Infinity});
  }
});
