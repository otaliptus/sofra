import assert from 'node:assert/strict';
import test from 'node:test';
import {Box3,OrthographicCamera,Vector3} from 'three';
import {fitEditorCamera} from '../photo-camera.js';
import {plateRadius} from '../table-setting.js';

test('ordinary editing keeps the plate centered at the original scale throughout an orbit',()=>{
  const camera=new OrthographicCamera();
  const food=new Box3(new Vector3(-.4,0,-.3),new Vector3(.4,.15,.3));
  for(const [w,h] of [[960,460],[390,640],[500,500]]){
    for(const [yaw,elevation] of [[0,Math.PI/2],[1.6,1.0],[-2,.2]]){
      fitEditorCamera(camera,{yaw,elevation},[food],w,h,plateRadius,0);
      const center=new Vector3().project(camera);
      assert.ok(Math.hypot(center.x,center.y)<1e-8);
      assert.ok(Math.abs(w/(camera.right-camera.left)-.94*Math.min(w,h)/(2*plateRadius))<1e-8);
    }
  }
});

test('the full editable scene stays in frame at portrait, landscape and shallow angles',()=>{
  const boxes=[
    new Box3(new Vector3(-.48,0,-.4),new Vector3(.5,8.2,.45)),
    new Box3(new Vector3(1.1,0,-1.55),new Vector3(1.8,.5,-1.2)),
    new Box3(new Vector3(-1.85,-.04,.65),new Vector3(-.9,.12,1.3))
  ];
  const camera=new OrthographicCamera();
  for(const [w,h] of [[390,620],[950,450],[820,215]]){
    for(const [yaw,elevation] of [[0,Math.PI/2],[1.2,.2],[-2,.72]]){
      const focusHeight=boxes[0].max.y/2;
      fitEditorCamera(camera,{yaw,elevation},boxes,w,h,plateRadius,focusHeight);
      const center=new Vector3().project(camera),lift=(camera.top+camera.bottom)/2;
      assert.ok(Math.abs(center.x)<1e-8);
      assert.ok(lift>=-1e-8 && lift<=focusHeight*Math.cos(elevation)+1e-8);
      for(const box of boxes){
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
          const p=new Vector3(x,y,z).project(camera);
          assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<1 && Math.abs(p.z)<1);
          assert.ok((1+p.y)*h/2>=Math.min(62,h*.17)-1e-6);
        }
      }
      for(let i=0;i<32;i++){
        const p=new Vector3(plateRadius*Math.cos(i*Math.PI/16),0,plateRadius*Math.sin(i*Math.PI/16)).project(camera);
        assert.ok(Math.abs(p.x)<1 && Math.abs(p.y)<1);
      }
      assert.ok(new Vector3(0,-1,-1).unproject(camera).y>-.037);
      assert.ok(new Vector3(0,1,1).unproject(camera).y<-.037);
    }
  }
});
