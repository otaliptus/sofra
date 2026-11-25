import {canvasSurface} from './canvas-surface.js';
import * as THREE from './node_modules/three/build/three.module.js';

const glaze=(color,roughness,map)=>new THREE.MeshStandardMaterial({color,roughness,map:map||null});
function add(group,geometry,material,x=0,y=0,z=0){
  const mesh=new THREE.Mesh(geometry,material);
  mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function lathe(profile){
  return new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),64);
}
function planar(geometry,diameter){
  const {position,uv}=geometry.attributes;
  for(let i=0;i<position.count;i++)uv.setXY(i,.5+position.getX(i)/diameter,.5-position.getZ(i)/diameter);
  return geometry;
}
function circle(radius,count=32){
  return Array.from({length:count},(_,i)=>[radius*Math.cos(i*2*Math.PI/count),radius*Math.sin(i*2*Math.PI/count)]);
}
// Dimensions and contact samples are in the same bread-width units as the plate.
function vessel(group,perimeter,contacts,surface){
  const width=2*Math.max(...perimeter.map(([x])=>Math.abs(x))),height=2*Math.max(...perimeter.map(([,z])=>Math.abs(z)));
  const depth=new THREE.Box3().setFromObject(group).max.y;
  const topY=(u,v)=>surface((u-.5)*width,(v-.5)*height);
  return {group,width,height,depth,perimeter,contacts,topY,mask:{alpha:(u,v)=>topY(u,v)>0?1:0}};
}
// Only released positions are shared on the board. Drag previews use a separate rig.
function openable(body,perimeter,contacts,surface,makeParts){
  function assemble(){
    const group=body.clone(),parts=new THREE.Group();group.add(parts);
    const rig=makeParts(parts);
    rig.pose(0);
    return {...rig,group,parts};
  }
  const sealed=assemble(),ref=vessel(sealed.group,perimeter,contacts,surface);
  const poses=new Map([[0,sealed.group]]);
  let studio;
  ref.forOpening=percent=>{
    if(!poses.has(percent)){
      const still=assemble();still.pose(percent/100);
      const bounds=new THREE.Box3().setFromObject(still.parts,true);
      still.group.userData.openBounds=[bounds.min.toArray(),bounds.max.toArray()];
      poses.set(percent,still.group);
    }
    return poses.get(percent);
  };
  ref.service=()=>studio??=assemble();
  return ref;
}
function foilGrain(){
  const canvas=canvasSurface(192,192);
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(192,192);
  for(let z=0;z<192;z++)for(let x=0;x<192;x++){
    const u=(x-96)/96,v=(z-96)/96,r=Math.hypot(u,v),a=Math.atan2(v,u);
    const crimp=Math.sin(38*a+.9*Math.sin(8*a)+3*r)*Math.min(1,r**5);
    const folds=Math.abs(Math.sin(12*u+5*v+1.5*Math.sin(7*v)))+Math.abs(Math.sin(11*v-3*u+Math.cos(9*u)));
    const speckle=Math.sin(82.1*x+17.7*z)*Math.cos(33.6*z+x);
    const shade=174+15*folds+25*crimp+5*speckle;
    const i=(z*192+x)*4;pixels.data.set([shade,shade,shade,255],i);
  }
  ctx.putImageData(pixels,0,0);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}
function foilLid(parts,print,grain){
  const radius=.109,y=.230;
  const foil=new THREE.RingGeometry(.00001,radius,72,20).rotateX(-Math.PI/2);
  planar(foil,.232);
  const silver=new THREE.MeshStandardMaterial({color:0xf4f6fc,map:grain,bumpMap:grain,bumpScale:.0015,roughness:.38,metalness:.19,side:THREE.BackSide});
  add(parts,foil,new THREE.MeshStandardMaterial({map:print,roughness:.43,metalness:.12}));
  add(parts,foil,silver);
  const tab=add(parts,new THREE.CircleGeometry(.022,32),new THREE.MeshStandardMaterial({color:0xdddcd1,roughness:.32,metalness:.36,side:THREE.DoubleSide}));
  const position=foil.attributes.position,flat=position.array.slice();
  const tabX=.043,tabZ=.102,roll=.021;
  const grip=new THREE.Vector3(),target=new THREE.Vector3();
  const bend=(z,crease,fold)=>{
    const length=Math.max(0,z-crease),angle=Math.min(length/roll,fold);
    const tail=length-roll*angle;
    return [y+roll*(1-Math.cos(angle))+tail*Math.sin(angle),Math.min(z,crease)+roll*Math.sin(angle)+tail*Math.cos(angle),angle];
  };
  function pose(t){
    // Keep the last crimp attached to the rear lip as the foil folds past the drink.
    const crease=radius-(2*radius-.009)*t,fold=2.12+.55*t*t;
    for(let i=0;i<position.count;i++){
      const x=flat[i*3],z=flat[i*3+2],[py,pz]=bend(z,crease,fold);
      const rim=Math.pow(Math.min(1,Math.hypot(x,z)/radius),9);
      const wrinkle=(.0008+.0009*t)*rim*Math.cos(38*Math.atan2(z,x));
      position.setXYZ(i,x,py+wrinkle,pz);
    }
    position.needsUpdate=true;foil.computeVertexNormals();foil.computeBoundingSphere();
    const [py,pz,angle]=bend(tabZ,crease,fold);
    tab.position.set(tabX,py-.0004,pz);tab.rotation.x=-Math.PI/2-angle;tab.rotation.z=.36;
    tab.scale.set(.74,1.27,1);
    grip.set(tabX,py+.016*Math.sin(angle),pz+.016*Math.cos(angle));
  }
  pose(1);target.copy(grip);
  return {pose,grip,target};
}
function ayran(tile){
  const g=new THREE.Group(),plastic=glaze(0xf6f1df,.34),blue=glaze(0x174577,.44);
  const label=tile(4).clone();label.wrapS=THREE.RepeatWrapping;label.repeat.x=2;label.offset.x=.5;
  add(g,lathe([[0,0],[.066,0],[.073,.005],[.075,.019],[.099,.216],[.104,.222],[.103,.227]]),plastic);
  add(g,lathe([[.077,.025],[.0998,.215]]),glaze(0xffffff,.48,label));
  for(const y of [.011,.017])add(g,lathe([[.075,y-.001],[.076,y],[.075,y+.001]]),plastic);
  add(g,lathe([[.10,.217],[.108,.220],[.109,.225],[.104,.228]]),blue);
  add(g,lathe([[.104,.228],[.101,.228],[.098,.224],[.096,.215],[.090,.207]]),plastic);
  const milk=glaze(0xfffbec,.24);
  add(g,lathe([[.098,.222],[.095,.221],[.087,.2195],[0,.2195]]),milk);
  // Bake the foam into one shareable mesh for all the cups on the table.
  const bubble=new THREE.SphereGeometry(1,8,5).toNonIndexed(),foam=new THREE.BufferGeometry();
  const positions=[],normals=[],uv=[];
  for(let i=0;i<33;i++){
    const a=i*2.4,r=.087+.007*Math.sin(i*12.2),size=.0016+.0011*(1+Math.sin(i*2.6));
    const copy=bubble.clone().scale(size,size*.5,size).translate(r*Math.cos(a),.220,r*Math.sin(a));
    positions.push(...copy.attributes.position.array);normals.push(...copy.attributes.normal.array);uv.push(...copy.attributes.uv.array);
  }
  foam.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  foam.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));foam.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  add(g,foam,glaze(0xfffcf2,.18));
  const perimeter=circle(.111);perimeter.push([.043,.126]);
  const grain=foilGrain();
  return openable(g,perimeter,circle(.063,8),(x,z)=>Math.hypot(x,z)<=.111 ? .230 : 0,parts=>foilLid(parts,tile(3),grain));
}
const juices={
  'portakal-suyu':{tile:0,flavor:'PORTAKAL',body:0xe79a22,side:0xeeb23b,ink:0x47622d},
  'visne-suyu':{tile:1,flavor:'VİŞNE',body:0x8b2535,side:0xa63c43,ink:0x641d2b},
  'kayisi-suyu':{tile:2,flavor:'KAYISI',body:0xf2b375,side:0xe3b574,ink:0x50715e}
};
const milks={
  'cilekli-sut':{tile:0,flavor:'ÇİLEKLİ',body:0xe1a0a0,side:0xf0b4b2,ink:0x68332f},
  'cikolatali-sut':{tile:1,flavor:'ÇİKOLATALI',body:0x946746,side:0xbb8c65,ink:0x422d23},
  'muzlu-sut':{tile:2,flavor:'MUZLU',body:0xeac568,side:0xf3d78b,ink:0x385f52}
};
function cartonSide(style,print){
  const canvas=canvasSurface(168,320);
  const ctx=canvas.getContext('2d'),ink='#'+style.ink.toString(16).padStart(6,'0');
  ctx.fillStyle='#'+style.side.toString(16).padStart(6,'0');ctx.fillRect(0,0,168,320);
  ctx.fillStyle=ink;ctx.fillRect(0,17,168,3);ctx.fillRect(0,296,168,3);
  const art=print.image;
  ctx.save();ctx.beginPath();ctx.ellipse(84,137,45,49,0,0,2*Math.PI);ctx.clip();
  ctx.drawImage(art,.08*art.width,.39*art.height,.84*art.width,.58*art.height,36,82,96,109);ctx.restore();
  ctx.fillStyle=style.tile===1?'#fff0cf':ink;ctx.textAlign='center';ctx.font='bold 16px Georgia';ctx.fillText(style.milk?'süt':'meyve suyu',84,219);
  ctx.font='14px Georgia';ctx.fillText('200 ml',84,274);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return map;
}
function cartonTop(style){
  const canvas=canvasSurface(320,228);
  const ctx=canvas.getContext('2d'),ink='#'+style.ink.toString(16).padStart(6,'0');
  ctx.fillStyle='#'+style.side.toString(16).padStart(6,'0');ctx.fillRect(0,0,320,228);
  ctx.fillStyle='#f7e7c6';ctx.fillRect(0,125,320,85);
  ctx.fillStyle=ink;ctx.font='bold 36px Georgia';ctx.textAlign='center';ctx.fillText(style.flavor,160,181,295);
  ctx.fillStyle=style.tile===1?'#fff0cf':ink;ctx.font='bold 22px Georgia';ctx.textAlign='right';ctx.fillText('PİPET',167,68);
  ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(180,60);ctx.lineTo(218,60);
  ctx.moveTo(209,53);ctx.lineTo(218,60);ctx.lineTo(209,67);ctx.stroke();
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}
function drinkingStraw(parts,port,ink){
  const straw=new THREE.Group();parts.add(straw);
  const plastic=glaze(0xfff5de,.36),rib=glaze(0xe8d8b7,.44);
  const length=.207,r=.0048;
  const path=new THREE.CatmullRomCurve3([
    [0,0,0],[0,.133,0],[0,.156,0],[.002,.164,0],[.010,.178,0],[.029,length,0]
  ].map(([x,y,z])=>new THREE.Vector3(x,y,z)));
  plastic.side=THREE.DoubleSide;
  add(straw,new THREE.TubeGeometry(path,44,r,14,false),plastic);
  const stripe=glaze(ink,.46);
  for(const angle of [Math.PI/2,-Math.PI/2]){
    const points=path.getPoints(36).map(p=>p.add(new THREE.Vector3(0,0,r*Math.sin(angle))));
    add(straw,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),36,.00062,5,false),stripe);
  }
  const up=new THREE.Vector3(0,1,0);
  for(let i=0;i<8;i++){
    const t=.706+i*.014,p=path.getPointAt(t);
    const ring=add(straw,new THREE.CylinderGeometry(r+.0006,r+.0006,.0012,14),rib,p.x,p.y,p.z);
    ring.quaternion.setFromUnitVectors(up,path.getTangentAt(t));
  }
  const end=path.getPoint(1),tip=path.getTangent(1);
  const hole=add(straw,new THREE.CircleGeometry(r*.78,14),glaze(0x583e30,.9),end.x,end.y,end.z);
  hole.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tip);
  const anchor=new THREE.Vector3(.088,.030,.025),hover=port.clone().add(new THREE.Vector3(0,.026,0));
  const inserted=port.clone().add(new THREE.Vector3(0,-.103,0));
  const grip=new THREE.Vector3(),target=port.clone();
  function pose(t){
    const lift=Math.min(t/.75,1);
    straw.position.copy(anchor).lerp(hover,lift);
    straw.position.x+=Math.sin(lift*Math.PI)*.047;
    if(t>.75)straw.position.lerp(inserted,(t-.75)/.25);
    straw.rotation.set(-.19*(1-lift),.70*(1-lift),-.07*lift);
    grip.set(0,.099*(1-lift),0).applyEuler(straw.rotation).add(straw.position);
  }
  return {pose,grip,target,straw};
}
function carton(style,tile){
  const g=new THREE.Group(),w=.164,d=.119,h=.264;
  const plain=glaze(style.body,.6),side=glaze(style.side,.64),edge=glaze(style.ink,.59);
  const print=glaze(0xffffff,.64,tile(style.tile));
  const panel=glaze(0xffffff,.63,cartonSide(style,tile(style.tile)));
  add(g,new THREE.BoxGeometry(w,h,d),[panel,panel,plain,plain,print,print],0,h/2);
  // Folded top flap, heat seal, and foil straw port on a single-serve carton.
  const flap=add(g,new THREE.BoxGeometry(w*.96,.004,d*.47),side,0,h+.001,-d*.23);
  flap.rotation.x=.029;
  const top=add(g,new THREE.PlaneGeometry(w*.985,d*.985),glaze(0xffffff,.60,cartonTop(style)),0,h+.004);
  top.rotation.x=-Math.PI/2;
  add(g,new THREE.BoxGeometry(w*.98,.003,.004),edge,0,h+.005,.001);
  const port=add(g,new THREE.CylinderGeometry(.012,.011,.002,24),glaze(0xc9c1a9,.32),w*.30,h+.0055,-d*.24);
  add(g,new THREE.CylinderGeometry(.007,.007,.001,20),glaze(0xa8a797,.45),port.position.x,h+.007,port.position.z);
  const sleeve=glaze(0xfaf8e6,.24);sleeve.transparent=true;sleeve.opacity=.28;sleeve.depthWrite=false;
  const wrapper=add(g,new THREE.BoxGeometry(.010,.185,.023),sleeve,w/2+.005,.119,.008);
  wrapper.rotation.x=-.19;wrapper.castShadow=false;
  for(const y of [-.088,.088]){
    for(let i=0;i<3;i++){
      const crimp=add(wrapper,new THREE.BoxGeometry(.002,.0009,.023),sleeve,.0057,y+i*.0019);
      crimp.castShadow=false;
    }
  }
  const ax=w/2,az=d/2,perimeter=[[-ax,-az],[ax,-az],[ax+.015,0],[ax,az],[-ax,az]];
  return openable(g,perimeter,[[0,0],[-ax,-az],[ax,-az],[ax,az],[-ax,az]],(x,z)=>Math.abs(x)<=ax&&Math.abs(z)<=az?h+.005:0,
    parts=>drinkingStraw(parts,port.position,style.ink));
}
function coffee(turkish,tile){
  const g=new THREE.Group(),base=turkish ? .012:0,r=turkish ? .069:.106,h=turkish ? .129:.193;
  const porcelain=glaze(turkish?0xfff6e2:0xbd7440,.27),inside=glaze(turkish?0xfff9e9:0xeaddc2,.25);
  if(turkish){
    const saucer=lathe([[0,.002],[.072,.002],[.086,.004],[.135,.014],[.159,.023],[.160,.026],[.154,.028],[.137,.024],[.098,.013],[.072,.011],[0,.012]]);
    add(g,planar(saucer,.337),glaze(0xffffff,.28,tile(5)));
  }
  const pattern=turkish?tile(8).clone():null;
  if(pattern){pattern.wrapS=THREE.RepeatWrapping;pattern.repeat.x=3;}
  const body=lathe([[0,.001],[r*.63,.001],[r*.67,h*.022],[r*.67,h*.08],[r*.78,h*.13],
    [r*.88,h*.26],[r*.96,h*.55],[r,h*.93],[r,h*.99]]);
  add(g,body,pattern?glaze(0xfffaed,.31,pattern):porcelain,0,base);
  if(!turkish){
    const stripe=glaze(0x70472e,.31);
    for(const level of [.80,.845]){
      const radius=r*(.96+.04*(level-.55)/.38);
      add(g,lathe([[radius+.00025,h*level],[radius+.00046,h*(level+.012)]]),stripe);
    }
    add(g,lathe([[r*.672,h*.025],[r*.672,h*.074]]),glaze(0xaa8561,.82));
  }
  add(g,lathe([[r,h*.985],[r*.99,h],[r*.955,h+.0008],[r*.93,h*.98],[r*.90,h*.67],[r*.67,h*.13],[0,h*.12]]),inside,0,base);
  const reach=turkish?1.55:1.58;
  const curve=new THREE.CatmullRomCurve3([
    [r*.95,h*.81],[r*1.24,h*.87],[r*1.48,h*.8],[r*reach,h*.66],[r*1.51,h*.47],[r*1.29,h*.31],[r*.86,h*.27]
  ].map(([x,y])=>new THREE.Vector3(x,y,0)));
  add(g,new THREE.TubeGeometry(curve,32,turkish ? .0068:.011,12,false),porcelain,0,base);
  const coffeeY=h*(turkish ? .916:.87),liquidR=r*.938;
  const liquid=lathe([[liquidR,coffeeY+.0016],[liquidR*.96,coffeeY],[liquidR*.84,coffeeY-.0004],[0,coffeeY-.0004]]);
  add(g,planar(liquid,liquidR*2),glaze(0xffffff,turkish ? .82:.25,tile(turkish?7:6)),0,base);
  const outer=turkish ? .16:r,perimeter=circle(outer);
  if(!turkish)perimeter.push([r*reach+.012,0]);
  return vessel(g,perimeter,circle(turkish ? .065:r*.62,8),(x,z)=>{
    if(Math.hypot(x,z)<=r)return base+h;
    if(x>0&&x<r*reach+.008&&Math.abs(z)<(turkish ? .007:.011))return base+h*.8;
    return turkish&&Math.hypot(x,z)<=outer ? .026 : 0;
  });
}
function printTiles(atlas,rows){
  // Each tile gets its own mip chain so the paper and porcelain stay crisp
  // without bleeding into neighbouring prints at shelf size.
  const tiles=new Map();
  return index=>{
    if(!tiles.has(index)){
      const w=atlas.width/3,h=atlas.height/rows;
      const canvas=canvasSurface(Math.round(w),Math.round(h));
      canvas.getContext('2d').drawImage(atlas,(index%3)*w,Math.floor(index/3)*h,w,h,0,0,canvas.width,canvas.height);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
      tiles.set(index,texture);
    }
    return tiles.get(index);
  };
}
export function createDrinkFactory(atlas,milkArt){
  const tile=printTiles(atlas,3),milkTile=printTiles(milkArt,1);
  return id=>{
    if(milks[id])return carton({...milks[id],milk:true},milkTile);
    if(id==='ayran')return ayran(tile);
    if(juices[id])return carton(juices[id],tile);
    return coffee(id==='turk-kahvesi',tile);
  };
}

// Artwork exporters also use the complete catalogue outside the game loop.
export function createDrinks(atlas,milkArt){
  const make=createDrinkFactory(atlas,milkArt);
  const ids=['ayran','kahve','turk-kahvesi',...Object.keys(juices),...Object.keys(milks)];
  return Object.fromEntries(ids.map(id=>[id,make(id)]));
}
