import * as THREE from './node_modules/three/build/three.module.js';

const rad=THREE.MathUtils.degToRad;
export const photoPresets={
  top:{yaw:0,pitch:90,lens:58,fill:.88},
  tilt:{yaw:-11,pitch:57,lens:55,fill:.88},
  low:{yaw:-16,pitch:26,lens:42,fill:.91},
  corner:{yaw:46,pitch:39,lens:48,fill:.88}
};
export function presetPose(id){
  const p=photoPresets[id];return {yaw:rad(p.yaw),elevation:rad(p.pitch)};
}
export function aimCamera(camera,orbit,target,distance){
  const {yaw,elevation}=orbit,cos=Math.cos(elevation),sin=Math.sin(elevation);
  camera.up.set(-Math.sin(yaw)*sin,cos,-Math.cos(yaw)*sin);
  camera.position.set(Math.sin(yaw)*cos,sin,Math.cos(yaw)*cos).multiplyScalar(distance).add(target);
  camera.lookAt(target);camera.updateMatrixWorld();
}
// Keep the usual plate scale until an editable object reaches the edge.
// Orthographic projection lets the fit pan by just the overflow at each edge.
export function fitEditorCamera(camera,orbit,boxes,width,height,plateRadius,stackBlend){
  const {yaw,elevation}=orbit,sy=Math.sin(yaw),cy=Math.cos(yaw),s=Math.sin(elevation),c=Math.cos(elevation);
  const axes=new THREE.Matrix4().set(
    cy,    0, -sy,   0,  // screen right
    -sy*s, c, -cy*s, 0,  // screen up
    sy*c,  s, cy*c,  0,  // toward the camera
    0,     0, 0,     1
  );
  const food=new THREE.Box3(),projected=new THREE.Box3();
  for(const box of boxes)food.union(projected.copy(box).applyMatrix4(axes));
  const rim=plateRadius*s,plateBottom=-rim-.037*c;
  const top=Math.max(rim+.025*c,food.max.y),left=Math.min(-plateRadius,food.min.x),right=Math.max(plateRadius,food.max.x);
  const short=Math.min(width,height),margin=Math.min(short*.03,24),bottomMargin=Math.min(height*.17,62);
  const scale=Math.min(
    short*.94/(2*plateRadius),
    (width-2*margin)/(right-left),
    (height-2*margin)/(top-plateBottom),
    food.isEmpty()?Infinity:(height-margin-bottomMargin)/(top-food.min.y)
  );
  const halfW=width/(2*scale),halfH=height/(2*scale);
  const x=THREE.MathUtils.clamp(0,right-halfW+margin/scale,left+halfW-margin/scale);
  const middle=(top+Math.min(plateBottom,food.min.y))/2;
  const y=THREE.MathUtils.clamp(middle*stackBlend,top-halfH+margin/scale,Math.min(plateBottom+halfH-margin/scale,food.min.y+halfH-bottomMargin/scale));
  camera.left=x-halfW;camera.right=x+halfW;camera.top=y+halfH;camera.bottom=y-halfH;
  // The bottom ray must start above the cloth, even on a portrait phone at a low angle.
  const distance=Math.max(4,food.max.z+.5,-camera.bottom*c/s+.5);
  camera.far=Math.max(24,distance-Math.min(-plateRadius,food.min.z)+4,distance+(camera.top*c+.04)/s+1);
  camera.updateProjectionMatrix();
  aimCamera(camera,orbit,new THREE.Vector3(),distance);
}
// Fit the actual edible silhouettes to a square 36 mm gate. The displayed
// canvas has a different aspect ratio, so only its viewfinder is the film gate.
export function composePhoto(points,orbit,preset){
  const {lens,fill}=photoPresets[preset]||photoPresets.tilt;
  const tan=18/lens,{yaw,elevation}=orbit,cos=Math.cos(elevation),sin=Math.sin(elevation);
  const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
  const up=new THREE.Vector3(-Math.sin(yaw)*sin,cos,-Math.cos(yaw)*sin);
  const back=new THREE.Vector3(Math.sin(yaw)*cos,sin,Math.cos(yaw)*cos);
  const local=points.map(p=>new THREE.Vector3(right.dot(p),up.dot(p),back.dot(p)));
  const center=new THREE.Box3().setFromPoints(local).getCenter(new THREE.Vector3());
  let distance=0;
  for(let i=0;i<3;i++){
    distance=0;
    for(const p of local){
      const extent=Math.max(Math.abs(p.x-center.x),Math.abs(p.y-center.y));
      distance=Math.max(distance,p.z-center.z+extent/(tan*fill));
    }
    if(i===2)break;
    const bounds=new THREE.Box2();
    for(const p of local){
      const scale=distance/(distance+center.z-p.z);
      bounds.expandByPoint(new THREE.Vector2((p.x-center.x)*scale,(p.y-center.y)*scale));
    }
    const drift=bounds.getCenter(new THREE.Vector2());
    center.x+=drift.x;center.y+=drift.y;
  }
  const target=right.multiplyScalar(center.x).addScaledVector(up,center.y).addScaledVector(back,center.z);
  return {target,distance,tan};
}
