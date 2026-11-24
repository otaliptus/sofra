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
function ayran(tiles){
  const g=new THREE.Group(),plastic=glaze(0xf6f1df,.34),blue=glaze(0x174577,.44);
  const label=tiles[4].clone();label.wrapS=THREE.RepeatWrapping;label.repeat.x=2;label.offset.x=.5;
  add(g,lathe([[0,0],[.066,0],[.073,.005],[.075,.019],[.099,.216],[.104,.222],[.103,.227]]),plastic);
  add(g,lathe([[.077,.025],[.0998,.215]]),glaze(0xffffff,.48,label));
  for(const y of [.011,.017])add(g,lathe([[.075,y-.001],[.076,y],[.075,y+.001]]),plastic);
  add(g,lathe([[.10,.217],[.108,.220],[.109,.225],[.104,.228]]),blue);
  const foil=new THREE.MeshStandardMaterial({map:tiles[3],color:0xffffff,roughness:.39,metalness:.14});
  const lid=lathe([[.109,.225],[.11,.227],[.106,.230],[.097,.229],[.077,.230],[.058,.229],[.034,.230],[0,.230]]);
  add(g,planar(lid,.232),foil);
  const tab=add(g,new THREE.CircleGeometry(.021,24),glaze(0xc6c8c8,.28),.078,.227,.076);
  tab.rotation.x=-Math.PI/2;tab.rotation.z=-.72;tab.scale.set(.76,1.35,1);
  const perimeter=circle(.111);perimeter.push([.093,.096]);
  return vessel(g,perimeter,circle(.063,8),(x,z)=>Math.hypot(x,z)<=.111 ? .230 : 0);
}
const juices={
  'portakal-suyu':{tile:0,body:0xe79a22,side:0xeeb23b,ink:0x47622d},
  'visne-suyu':{tile:1,body:0x8b2535,side:0xa63c43,ink:0x641d2b},
  'kayisi-suyu':{tile:2,body:0xf2b375,side:0xe3b574,ink:0x50715e}
};
function cartonSide(style,print){
  const canvas=document.createElement('canvas');canvas.width=168;canvas.height=320;
  const ctx=canvas.getContext('2d'),ink='#'+style.ink.toString(16).padStart(6,'0');
  ctx.fillStyle='#'+style.side.toString(16).padStart(6,'0');ctx.fillRect(0,0,168,320);
  ctx.fillStyle=ink;ctx.fillRect(0,17,168,3);ctx.fillRect(0,296,168,3);
  const art=print.image;
  ctx.save();ctx.beginPath();ctx.ellipse(84,137,45,49,0,0,2*Math.PI);ctx.clip();
  ctx.drawImage(art,.08*art.width,.39*art.height,.84*art.width,.58*art.height,36,82,96,109);ctx.restore();
  ctx.fillStyle=style.tile===1?'#f9e9bc':ink;ctx.textAlign='center';ctx.font='bold 16px Georgia';ctx.fillText('meyve suyu',84,219);
  ctx.font='14px Georgia';ctx.fillText('200 ml',84,274);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return map;
}
function carton(style,tiles){
  const g=new THREE.Group(),w=.164,d=.119,h=.264;
  const plain=glaze(style.body,.6),side=glaze(style.side,.64),edge=glaze(style.ink,.59);
  const print=glaze(0xffffff,.64,tiles[style.tile]);
  const panel=glaze(0xffffff,.63,cartonSide(style,tiles[style.tile]));
  add(g,new THREE.BoxGeometry(w,h,d),[panel,panel,plain,plain,print,print],0,h/2);
  const flavor=tiles[style.tile].clone();flavor.repeat.set(.96,.31);flavor.offset.set(.02,.675);
  const banner=add(g,new THREE.PlaneGeometry(w*.985,d*.49),glaze(0xffffff,.6,flavor),0,h+.0007,d*.252);
  banner.rotation.x=-Math.PI/2;
  // Folded top flap, heat seal, and foil straw port on a single-serve carton.
  const flap=add(g,new THREE.BoxGeometry(w*.96,.004,d*.47),side,0,h+.001,-d*.23);
  flap.rotation.x=.029;
  add(g,new THREE.BoxGeometry(w*.98,.003,.004),edge,0,h+.004,.001);
  const port=add(g,new THREE.CylinderGeometry(.012,.011,.002,24),glaze(0xc9c1a9,.32),w*.30,h+.004,-d*.24);
  add(g,new THREE.CylinderGeometry(.007,.007,.001,20),glaze(0xa8a797,.45),port.position.x,h+.0055,port.position.z);
  // The unused drinking straw is still attached to the side in its sleeve.
  const straw=add(g,new THREE.CylinderGeometry(.0042,.0042,h*.80,12),glaze(0xf9edd0,.36),w/2+.004,h*.49,0);
  straw.rotation.x=-.17;
  for(let i=0;i<5;i++){
    add(g,new THREE.CylinderGeometry(.0046,.0046,.002,12),edge,w/2+.004,h*.72+i*.003,-.0108-i*.0005).rotation.x=-.17;
  }
  const ax=w/2,az=d/2,perimeter=[[-ax,-az],[ax,-az],[ax+.009,0],[ax,az],[-ax,az]];
  return vessel(g,perimeter,[[0,0],[-ax,-az],[ax,-az],[ax,az],[-ax,az]],(x,z)=>Math.abs(x)<=ax&&Math.abs(z)<=az?h+.005:0);
}
function coffee(turkish,tiles){
  const g=new THREE.Group(),base=turkish ? .012:0,r=turkish ? .069:.106,h=turkish ? .129:.193;
  const porcelain=glaze(turkish?0xfff6e2:0xbd7440,.27),inside=glaze(turkish?0xfff9e9:0xeaddc2,.25);
  if(turkish){
    const saucer=lathe([[0,.002],[.072,.002],[.086,.004],[.135,.014],[.159,.023],[.160,.026],[.154,.028],[.137,.024],[.098,.013],[.072,.011],[0,.012]]);
    add(g,planar(saucer,.337),glaze(0xffffff,.28,tiles[5]));
  }
  const pattern=turkish?tiles[8].clone():null;
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
  add(g,planar(liquid,liquidR*2),glaze(0xffffff,turkish ? .82:.25,tiles[turkish?7:6]),0,base);
  const outer=turkish ? .16:r,perimeter=circle(outer);
  if(!turkish)perimeter.push([r*reach+.012,0]);
  return vessel(g,perimeter,circle(turkish ? .065:r*.62,8),(x,z)=>{
    if(Math.hypot(x,z)<=r)return base+h;
    if(x>0&&x<r*reach+.008&&Math.abs(z)<(turkish ? .007:.011))return base+h*.8;
    return turkish&&Math.hypot(x,z)<=outer ? .026 : 0;
  });
}
export function createDrinks(atlas){
  // Each tile gets its own mip chain so the paper and porcelain stay crisp
  // without bleeding into neighbouring prints at shelf size.
  const tiles=Array.from({length:9},(_,i)=>{
    const canvas=document.createElement('canvas'),size=atlas.width/3;
    canvas.width=canvas.height=Math.round(size);
    canvas.getContext('2d').drawImage(atlas,(i%3)*size,Math.floor(i/3)*atlas.height/3,size,atlas.height/3,0,0,canvas.width,canvas.height);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
  });
  const models={'ayran':ayran(tiles),'kahve':coffee(false,tiles),'turk-kahvesi':coffee(true,tiles)};
  for(const [id,style] of Object.entries(juices))models[id]=carton(style,tiles);
  return models;
}
