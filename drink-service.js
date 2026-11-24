import * as THREE from './node_modules/three/build/three.module.js';

let studio;
function makeStudio(){
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
  renderer.setClearColor(0x000000,0);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,4);
  scene.add(new THREE.HemisphereLight(0xfffbf1,0xd9c6ac,2.15));
  const key=new THREE.DirectionalLight(0xfff1dd,2.05);key.position.set(-1,2,2);scene.add(key);
  const paper=document.createElement('canvas');paper.width=paper.height=96;
  const ctx=paper.getContext('2d'),shade=ctx.createRadialGradient(48,48,4,48,48,47);
  shade.addColorStop(0,'#543d2a62');shade.addColorStop(.55,'#543d2a30');shade.addColorStop(1,'#543d2a00');
  ctx.fillStyle=shade;ctx.fillRect(0,0,96,96);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.32,.28),new THREE.MeshBasicMaterial({
    map:new THREE.CanvasTexture(paper),transparent:true,depthWrite:false
  }));
  shadow.rotation.x=-Math.PI/2;shadow.position.set(.012,-.001,-.004);scene.add(shadow);
  return {renderer,scene,camera};
}

export const serviceControls='<div class="drink-stage"><span class="drink-grip" aria-hidden="true"></span><span class="drink-target" aria-hidden="true" hidden></span></div>'+
  '<p class="drink-hint" role="status"></p><div class="buttons drink-buttons"><button type="button" id="prepare-drink"></button><button type="button" class="primary" id="serve-drink">Sofraya dön</button></div>';

export function serveDrink(sheet,rig,kind,prepared,onPrepare){
  studio??=makeStudio();
  const {renderer,scene,camera}=studio,stage=sheet.querySelector('.drink-stage');
  const grip=stage.querySelector('.drink-grip'),target=stage.querySelector('.drink-target');
  const hint=sheet.querySelector('.drink-hint'),action=sheet.querySelector('#prepare-drink'),lid=kind==='lid';
  const instruction=lid?'Folyo ucunu tutup geriye doğru soy.':'Yandaki pipeti tutup kutunun üstündeki deliğe bırak.';
  const served=lid?'Ayranın kapağı açıldı.':'Pipet takıldı.';
  stage.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
  scene.add(rig.group);
  const center=new THREE.Vector3(0,lid ? .18 : .207,0);
  camera.position.copy(center).add(new THREE.Vector3(.56,lid?1.04:.83,1));camera.lookAt(center);camera.updateMatrixWorld();
  let value=prepared?1:0,done=prepared,active=null,frame=0,animating=false,alive=true;
  const start=new THREE.Vector2(),end=new THREE.Vector2(),hand=new THREE.Vector2(),offset=new THREE.Vector3();
  function screen(point){
    const p=point.clone().project(camera);
    return new THREE.Vector2((p.x+1)*stage.clientWidth/2,(1-p.y)*stage.clientHeight/2);
  }
  function mark(node,pt){node.style.left=pt.x+'px';node.style.top=pt.y+'px';}
  function draw(){
    rig.pose(value);
    if(rig.straw)rig.straw.position.add(offset);
    mark(grip,screen(rig.grip.clone().add(offset)));mark(target,screen(rig.target));
    renderer.render(scene,camera);
  }
  function resize(){
    const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
    const half=Math.max(lid ? .225 : .267,.147*h/w);
    camera.top=half;camera.bottom=-half;camera.left=-half*w/h;camera.right=half*w/h;camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(w,h,false);
    rig.pose(0);start.copy(screen(rig.grip));end.copy(screen(rig.target));draw();
  }
  function controls(){
    grip.hidden=done||animating;target.hidden=lid||!active;
    stage.dataset.dragging=String(!!active);stage.dataset.ready=String(done);
    action.hidden=done;action.disabled=animating;
    action.textContent=lid?'Kapağı soy':'Pipeti tak';hint.textContent=done?served:instruction;
  }
  function settle(to){
    const from=value,drift=offset.clone(),at=performance.now();
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=reduce?0:Math.max(180,Math.abs(to-from)*690);
    animating=true;controls();
    function tick(now){
      if(!alive||!sheet.open)return;
      const t=duration?Math.min(1,(now-at)/duration):1,ease=t*t*(3-2*t);
      value=from+(to-from)*ease;offset.copy(drift).multiplyScalar(1-ease);draw();
      if(t<1){frame=requestAnimationFrame(tick);return;}
      animating=false;frame=0;controls();
    }
    // A completed drop is an edit even if the player immediately closes the sheet.
    if(to===1&&!done){done=true;onPrepare();}
    tick(at);
  }
  function point(e){const r=stage.getBoundingClientRect();return new THREE.Vector2(e.clientX-r.left,e.clientY-r.top);}
  function down(e){
    if(done||active||e.button!==0)return;
    const p=point(e);
    // Offer the length of the wrapped straw as a pickup zone.
    const distance=lid?p.distanceTo(start):Math.hypot(p.x-start.x,(p.y-start.y)*.52);
    if(distance>Math.max(25,stage.clientHeight*.08))return;
    if(animating){cancelAnimationFrame(frame);animating=false;value=0;offset.set(0,0,0);draw();}
    active={id:e.pointerId,p};stage.setPointerCapture(e.pointerId);controls();e.preventDefault();
  }
  function move(e){
    if(active?.id!==e.pointerId)return;
    const p=point(e),delta=p.clone().sub(active.p),axis=end.clone().sub(start);
    const along=THREE.MathUtils.clamp(delta.dot(axis)/Math.max(1,axis.lengthSq()),0,1);
    value=along*(lid?1:.75);offset.set(0,0,0);
    if(!lid){
      // While held, let the straw follow the hand even on a missed drop.
      rig.pose(value);
      hand.copy(start).add(delta);
      const actual=rig.grip.clone().project(camera);
      const desired=new THREE.Vector3(2*hand.x/stage.clientWidth-1,1-2*hand.y/stage.clientHeight,actual.z);
      offset.copy(desired.unproject(camera)).sub(rig.grip);
    }
    draw();
  }
  function finish(e){
    if(active?.id!==e.pointerId)return;
    let success=false;
    if(e.type==='pointerup'){
      move(e);
      success=lid?value>=.67:point(e).distanceTo(end)<=Math.max(24,stage.clientHeight*.085);
    }
    active=null;settle(success?1:0);
  }
  stage.onpointerdown=down;stage.onpointermove=move;
  stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=finish;
  const back=sheet.querySelector('#serve-drink');
  action.onclick=()=>{if(!animating&&!active&&!done){settle(1);back.focus({preventScroll:true});}};
  back.onclick=()=>sheet.close();
  const observer=new ResizeObserver(resize);observer.observe(stage);resize();controls();
  return {state:()=>({kind,progress:Math.round(value*100)/100,prepared:done,animating}),close(){
    alive=false;active=null;cancelAnimationFrame(frame);observer.disconnect();scene.remove(rig.group);renderer.domElement.remove();
  }};
}
