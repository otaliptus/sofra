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
// Orbit the plate's centerline. A tall sandwich lifts the focus along that line.
export function fitEditorCamera(camera,orbit,boxes,width,height,plateRadius,maxFocusHeight){
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
  const top=Math.max(rim+.025*c,food.max.y);
  const halfWidth=Math.max(plateRadius,-food.min.x,food.max.x);
  const short=Math.min(width,height),margin=Math.min(short*.03,24),bottomMargin=Math.min(height*.17,62);
  const above=height/2-margin,belowFood=height/2-bottomMargin;
  // Individual edges must fit within the allowed lift. The full spans must fit
  // simultaneously, including space below the food for the editing controls.
  const unitsPerPixel=Math.max(
    2*plateRadius/(short*.94),
    halfWidth/(width/2-margin),
    Math.max(top-maxFocusHeight*c,-plateBottom)/above,
    -food.min.y/belowFood,
    (top-plateBottom)/(2*above),
    (top-food.min.y)/(above+belowFood)
  );
  const halfW=width*unitsPerPixel/2,halfH=height*unitsPerPixel/2;
  const focusY=Math.max(0,top-above*unitsPerPixel);
  camera.left=-halfW;camera.right=halfW;camera.top=focusY+halfH;camera.bottom=focusY-halfH;
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
