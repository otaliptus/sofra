import * as THREE from '../../node_modules/three/build/three.module.js';
import { cloths } from '../shared/recipe.js';

// The bread rests at y=0 in the flat well. Loose pieces sample the same
// radial profile that shapes the plate, including its gently rising lip.
const top = [[0,0],[.57,0],[.63,.0008],[.66,.003],[.69,.008],
  [.72,.016],[.75,.025],[.769,.029],[.778,.028],[.78,.025]];
const underside = [[0,-.018],[.33,-.018],[.35,-.022],[.355,-.037],
  [.368,-.037],[.375,-.019],[.46,-.015],[.60,-.012],[.67,-.005],
  [.72,.004],[.756,.015],[.776,.02]];
export const plateRadius = top.at(-1)[0];
export const clothHeight = -.037;

export function tableHeight(x,z) {
  const r = Math.hypot(x,z);
  if (r > plateRadius) return clothHeight;
  for (let i=1; i<top.length; i++) {
    const [outer, high] = top[i];
    if (r <= outer) {
      const [inner, low] = top[i-1];
      return THREE.MathUtils.lerp(low,high,(r-inner)/(outer-inner));
    }
  }
  return top.at(-1)[1];
}

export function setTable(scene, getMap, plateMap) {
  const size=48;
  const cloth=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshLambertMaterial());
  cloth.rotation.x=-Math.PI/2;
  cloth.position.y=clothHeight;
  cloth.receiveShadow=true;
  scene.add(cloth);

  // A single open issue has physical edges, including in low-angle photos.
  let paper,activeCloth;
  const profile=[...underside,...top.slice().reverse()];
  const geometry=new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),160);
  const {position,uv}=geometry.attributes;
  for(let i=0;i<position.count;i++){
    if(i%profile.length<underside.length)uv.setXY(i,.5,.5);
    else uv.setXY(i,.5+position.getX(i)/(2*plateRadius),.5-position.getZ(i)/(2*plateRadius));
  }
  const glaze=new THREE.MeshPhysicalMaterial({map:plateMap,roughness:.34,clearcoat:.18,clearcoatRoughness:.25});
  const plate=new THREE.Mesh(geometry,glaze);
  plate.castShadow=true;
  plate.receiveShadow=true;
  scene.add(plate);
  return {plate,setCloth(id){
    if(id===activeCloth)return;
    const newspaper=id==='gazete';
    if(newspaper&&!paper){
      const print=getMap('gazete'),width=cloths.gazete.width;
      paper=new THREE.Mesh(new THREE.PlaneGeometry(width,width*print.image.height/print.image.width),
        new THREE.MeshLambertMaterial({map:print}));
      paper.rotation.set(-Math.PI/2,0,-.058);paper.position.set(-.07,clothHeight,.27);
      paper.castShadow=paper.receiveShadow=true;scene.add(paper);
    }
    if(paper)paper.visible=newspaper;
    cloth.position.y=newspaper?clothHeight-.004:clothHeight;
    const fabric=newspaper?'kareli':id,map=getMap(fabric),width=cloths[fabric].width;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.repeat.set(size/width,size/(width*map.image.height/map.image.width));
    map.center.set(.5,.5);map.rotation=.105;
    cloth.material.map=map;activeCloth=id;
  }};
}
