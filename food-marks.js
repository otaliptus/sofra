import * as THREE from './node_modules/three/build/three.module.js';
import { clamp, pantry } from './recipe.js';

const flakes={
  'pul-biber':{colors:['#7f2110','#ad3216','#cc4922','#e19b37'],size:4.3,stretch:.63,count:14},
  karabiber:{colors:['#2e261e','#41382f','#69604e','#958570'],size:2.15,stretch:.85,count:19},
  kekik:{colors:['#68633e','#879057','#a39b6c','#6d754a'],size:3.5,stretch:.38,count:14},
  nane:{colors:['#424f30','#5a6942','#727c4e','#354831'],size:2.65,stretch:.65,count:19}
};

function sampler(seed){
  return ()=>{seed=Math.imul(1664525,seed)+1013904223|0;return (seed>>>0)/4294967296;};
}
function alongPath(points,spacing,visit){
  let traveled=0,next=0;
  for(let i=1;i<points.length;i++){
    const [x,y]=points[i-1],dx=points[i][0]-x,dy=points[i][1]-y,len=Math.hypot(dx,dy);
    if(!len)continue;
    const heading=Math.atan2(dy,dx);
    while(next<=traveled+len){
      const f=(next-traveled)/len;visit(x+dx*f,y+dy*f,heading,next);next+=spacing;
    }
    traveled+=len;
  }
  if(!traveled)visit(points[0][0],points[0][1],-.28,0);
}
function scatter(ctx,spec,points,unit,random){
  alongPath(points,22*unit,(x,y)=>{
    for(let i=0;i<spec.count;i++){
      const a=random()*Math.PI*2,r=Math.sqrt(random())*44*unit;
      const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.83;
      const size=spec.size*unit*(.45+random()),tilt=random()*Math.PI;
      ctx.save();ctx.translate(px,py);ctx.rotate(tilt);ctx.scale(size,size*spec.stretch);
      ctx.beginPath();ctx.moveTo(-1,0);ctx.lineTo(-.45,-.82);ctx.lineTo(.62,-.94);ctx.lineTo(1,.17);ctx.lineTo(.22,1);ctx.lineTo(-.72,.63);ctx.closePath();
      ctx.fillStyle=spec.colors[Math.floor(random()*spec.colors.length)];ctx.fill();
      ctx.fillStyle='#ffefb076';ctx.fillRect(-.52,-.55,.63,.24);ctx.restore();
    }
  });
}
// Pull one continuous photographed knife mark along the actual path. Its
// loaded leading edge, streaks, and dry trailing edge occur once per stroke.
function knife(ctx,image,points,unit,load){
  if(points.length===1){
    const [x,y]=points[0],size=68*unit*(.6+.4*load);
    ctx.drawImage(image,x-size*.5,y-size*.34,size,size*.67);return;
  }
  const path=[{x:points[0][0],y:points[0][1],d:0}];
  for(const [x,y] of points.slice(1)){
    const prev=path.at(-1),len=Math.hypot(x-prev.x,y-prev.y);
    if(len>.01)path.push({x,y,d:prev.d+len});
  }
  if(path.length<2){knife(ctx,image,[points[0]],unit,load);return;}
  const length=path.at(-1).d;
  const tip=19*unit,tail=24*unit,total=length+tip+tail;
  function position(d){
    let lo=0,hi=path.length-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(path[mid].d<=d)lo=mid;else hi=mid;}
    const a=path[lo],b=path[hi],f=(d-a.d)/(b.d-a.d);
    return [a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f];
  }
  const strips=Math.min(450,Math.ceil(total/(3*unit)));
  for(let i=0;i<strips;i++){
    const t=(i+.5)/strips,d=t*total-tip,[x,y]=position(d);
    const a=position(d-4*unit),b=position(d+4*unit);
    const width=unit*(84+9*Math.sin(t*3.4))*(.64+.36*load)*(1-.36*clamp((d/unit)/950,0,1));
    const sourceX=i*image.width/strips,sourceWidth=image.width/strips;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b[1]-a[1],b[0]-a[0]));
    const stripWidth=total/strips+.9*unit;
    ctx.drawImage(image,sourceX,0,sourceWidth,image.height,-stripWidth/2,-width/2,stripWidth,width);ctx.restore();
  }
}
function canvas(w,h){
  const surface=document.createElement('canvas');surface.width=w;surface.height=h;return surface;
}

const serving = {
  cream: {width:155, spacing:170},
  jam: {width:132, spacing:116},
  menemen: {width:175, spacing:96}
};
const maxRise=.065;
const tau=Math.PI*2;

// Follow the actual gesture at fixed physical intervals. Sparse touch events and
// dense mouse input produce the same taper and cross-section.
function trace(points,spacing) {
  const path=[];
  alongPath(points,spacing,(x,y,a,d)=>path.push({x,y,a,d}));
  const [x,y]=points.at(-1),end=path.at(-1),tail=Math.hypot(x-end.x,y-end.y);
  if(tail>.01)path.push({x,y,a:end.a,d:end.d+tail});
  const raw=path.map(p=>[p.x,p.y]);
  for(let i=1;i<path.length-1;i++){
    // The material rounds tight turns as it leaves the nozzle.
    const reach=Math.min(3,i,path.length-1-i);
    let x=0,y=0,weight=0;
    for(let j=-reach;j<=reach;j++){
      const w=reach+1-Math.abs(j);x+=raw[i+j][0]*w;y+=raw[i+j][1]*w;weight+=w;
    }
    path[i].x=x/weight;path[i].y=y/weight;
  }
  for(let i=0;i<path.length;i++){
    const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)];
    path[i].a=Math.atan2(b.y-a.y,b.x-a.x);
  }
  return path;
}

function pipe(ctx,food,points,unit,amount,relief){
  const red=food==='ketcap',path=trace(points,4.5*unit),length=path.at(-1).d/unit;
  const radius=(red?11:13)*unit;
  if(length<1){
    const {x,y}=path[0],r=radius*(1.3+.68*amount);
    ctx.save();ctx.translate(x,y);ctx.rotate(-.45);ctx.scale(r,r*.85);
    // The nozzle lifts from one side, leaving a small off-centre peak.
    ctx.beginPath();ctx.moveTo(1.12,-.20);
    ctx.bezierCurveTo(.65,-.30,.60,-.94,-.08,-.96);
    ctx.bezierCurveTo(-.78,-1.02,-1.14,-.44,-.98,.19);
    ctx.bezierCurveTo(-.83,.92,.07,1.12,.65,.66);
    ctx.bezierCurveTo(.95,.42,.76,.07,1.12,-.20);ctx.closePath();
    const g=ctx.createRadialGradient(-.22,-.28,.02,-.03,.04,1.13);
    const colors=relief?(red?['#540000','#440000','#290000','#050000']:['#660000','#520000','#310000','#070000']):
      (red?['#d74324','#be311a','#ad2b17','#852310']:['#f7e9ca','#f2dfb9','#e4cfa7','#cbb78c']);
    [0,.43,.79,1].forEach((stop,i)=>g.addColorStop(stop,colors[i]));ctx.fillStyle=g;ctx.fill();
    if(!relief){
      ctx.beginPath();ctx.moveTo(-.62,-.19);ctx.bezierCurveTo(-.72,-.57,-.38,-.77,-.13,-.68);
      ctx.bezierCurveTo(-.46,-.56,-.53,-.39,-.62,-.19);ctx.fillStyle=red?'#ffbd916e':'#fffaf0a8';ctx.fill();
    }
    ctx.restore();return;
  }
  // A squeeze starts as a bead, narrows to the nozzle bore, then pinches off.
  for(const p of path){
    const d=p.d/unit;
    p.r=radius*(1+(amount*.63+.25)*Math.exp(-d/15))*
      (1+.075*Math.sin(d*.086))*(path.length===1?1: .49+.51*Math.min(1,(length-d)/12));
  }
  const levels=relief?10:3;
  for(let i=0;i<levels;i++){
    const f=i/levels,band=Math.sqrt(1-f*f);
    ctx.fillStyle=relief?'rgb('+Math.round(255*(red?.013:.017)/maxRise*(.22+.78*f))+ ' 0 0)':
      (red?['#8f2314','#b32916','#c7351d']:['#c4ac7d','#ead7ab','#f3e2bf'])[i];
    ctx.beginPath();
    for(const side of [1,-1]){
      for(let j=0;j<path.length;j++){
        const p=path[side===1?j:path.length-1-j],r=p.r*band*side;
        const x=p.x-Math.sin(p.a)*r,y=p.y+Math.cos(p.a)*r;
        if(j===0&&side===1)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
    }
    ctx.closePath();ctx.fill();
    for(const p of path.length===1?[path[0]]:[path[0],path.at(-1)]){
      ctx.beginPath();ctx.ellipse(p.x,p.y,p.r*band,p.r*band*.94,p.a,0,tau);ctx.fill();
    }
  }
  if(relief)return;
  // A narrow reflection runs down the light-facing shoulder. The highlight
  // softens at bends and fades into the pinched tail.
  for(const [spread,opacity] of [[.21,.28],[.075,.52]]){
    ctx.beginPath();
    for(const side of [1,-1]){
      for(let j=0;j<path.length;j++){
        const p=path[side===1?j:path.length-1-j],nx=-Math.sin(p.a),ny=Math.cos(p.a);
        const light=-.49*nx-.87*ny;
        const taper=Math.min(1,(p.d/unit+2)/10,(length-p.d/unit+1)/15);
        const band=p.r*(light*.48+side*spread*taper*(.72+.28*Math.sin(p.d/unit*.074)));
        const x=p.x+nx*band,y=p.y+ny*band;
        if(!j&&side===1)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
    }
    ctx.closePath();ctx.fillStyle=red?'rgba(255,174,122,'+opacity+')':'rgba(255,250,232,'+opacity+')';ctx.fill();
  }
}

function serve(ctx,art,mark,points,unit,random,relief){
  const id=mark.food,spec=serving[id],load=mark.load??1;
  const path=trace(points,8*unit),length=path.at(-1).d/unit;
  const scale=(.8+.2*load)*(mark.portion??1);
  const atlas=art[relief?'serving-relief':'servings'];
  const cell=atlas.width/3,row={cream:0,jam:1,menemen:2}[id];
  // A knife pulls out thin streaks. Cherry syrup also trails the spoon.
  // Egg curds travel as separate overlapping spoonfuls.
  if(length>6 && id!=='menemen'){
    if(!relief)knife(ctx,art['smear-'+id],points,unit*(id==='cream'?1.23:1.05),load);
    else{
      ctx.strokeStyle=id==='cream'?'#1a0000':'#0d0000';ctx.lineWidth=(id==='cream'?65:48)*unit;
      ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(...points[0]);
      for(const p of points.slice(1))ctx.lineTo(...p);
      ctx.stroke();
    }
  }
  alongPath(points,spec.spacing*unit,(x,y,angle,distance)=>{
    const first=distance===0;
    const variant=Math.floor(random()*3);
    const size=spec.width*unit*scale*(first?1:(id==='menemen'?.87:id==='jam'?.70:.52))*(.9+.2*random());
    const wobble=(random()-.5)*(first?.8:1.15);
    const drift=first?0:(random()-.5)*size*.28;
    ctx.save();ctx.translate(x-Math.sin(angle)*drift,y+Math.cos(angle)*drift);
    ctx.rotate((length>9?angle:0)+wobble);
    ctx.drawImage(atlas,variant*cell,row*cell,cell,cell,-size*.5,-size*.48,size,size*.96);
    ctx.restore();
  });
}

function mapTexture(surface,color=false){
  const map=new THREE.CanvasTexture(surface);map.anisotropy=4;
  if(color)map.colorSpace=THREE.SRGBColorSpace;
  return map;
}

// One conforming surface per decorated food. Only its unfinished stroke is
// rasterized again while drawing. The low-resolution height field drives real
// mesh vertices for side views, picking and the next ingredient's support.
export function createCoating(ref,art){
  const w=Math.max(16,Math.round(1000*ref.width)),h=Math.max(16,Math.round(1000*ref.height));
  const layers=[1,.32].map((ratio,i)=>{
    const width=Math.round(w*ratio),height=Math.round(h*ratio);
    const dry=canvas(width,height),wet=canvas(width,height);
    return {stroke:i===1?canvas(width,height).getContext('2d'):null,dry:dry.getContext('2d'),wet:wet.getContext('2d',{willReadFrequently:i===1}),width,height,relief:i===1};
  });
  const color=mapTexture(layers[0].wet.canvas,true),heightMap=mapTexture(layers[1].wet.canvas);
  const material=new THREE.MeshPhongMaterial({map:color,alphaTest:.13,side:THREE.DoubleSide,
    specular:0x353026,shininess:28,bumpMap:heightMap,bumpScale:.0016,specularMap:heightMap});
  const nx=Math.max(12,Math.ceil(ref.width*150)),nz=Math.max(12,Math.ceil(ref.height*150));
  const geometry=new THREE.PlaneGeometry(ref.width,ref.height,nx,nz);geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;
  let pixels=null,frozen=[],lastMark=null,lastCount=-1,lastLength=-1,lastPortion,lastShape;
  function draw(ctx,layer,mark){
    if(!mark)return;
    const unit=layer.width/(ref.width*1000),points=mark.line.map(([x,y])=>[x*layer.width/1024,y*layer.height/1024]);
    const [sx,sy]=mark.line[0],random=sampler(sx*16381+sy*97+mark.food.length*29);
    const kind=pantry[mark.food].kind;
    if(kind==='spice'){if(!layer.relief)scatter(ctx,flakes[mark.food],points,unit,random);}
    else if(kind==='sauce')pipe(ctx,mark.food,points,unit,mark.portion??1,layer.relief);
    else serve(ctx,art,mark,points,unit,random,layer.relief);
  }
  function deposit(ctx,layer,mark){
    if(!mark)return;
    if(!layer.relief){draw(ctx,layer,mark);return;}
    const single=layer.stroke;
    single.clearRect(0,0,layer.width,layer.height);draw(single,layer,mark);
    // Keep a piped ribbon above the folds or fruit already underneath it.
    ctx.globalCompositeOperation='lighter';ctx.drawImage(single.canvas,0,0);
    ctx.globalCompositeOperation='source-over';
  }
  function rise(u,v){
    if(!pixels||u<0||u>1||v<0||v>1)return 0;
    const {width,height}=layers[1],x=Math.min(width-1,Math.floor(u*width)),y=Math.min(height-1,Math.floor(v*height));
    const i=4*(y*width+x);return maxRise*pixels[i]*pixels[i+3]/65025;
  }
  function update(marks,shape){
    const last=marks.at(-1),length=last?.line.length??0,portion=last?.portion;
    const dirty=lastCount!==marks.length||lastMark!==last||lastLength!==length||lastPortion!==portion;
    mesh.visible=!!last;
    if(dirty){
      const count=Math.max(0,marks.length-1),reuse=frozen.length<=count&&frozen.every((m,i)=>m===marks[i]);
      for(const layer of layers){
        const {dry,wet,width,height}=layer;
        if(!reuse)dry.clearRect(0,0,width,height);
        for(let i=reuse?frozen.length:0;i<count;i++)deposit(dry,layer,marks[i]);
        wet.clearRect(0,0,width,height);wet.drawImage(dry.canvas,0,0);deposit(wet,layer,last);
        // The same photographed silhouette masks the colour and the relief,
        // including the holes in simit and olive slices.
        wet.globalCompositeOperation='destination-in';wet.drawImage(ref.image,0,0,width,height);
        wet.globalCompositeOperation='source-over';
      }
      const {wet,width,height}=layers[1];pixels=last?wet.getImageData(0,0,width,height).data:null;
      color.needsUpdate=heightMap.needsUpdate=true;
      frozen=marks.slice(0,count);lastMark=last;lastLength=length;lastCount=marks.length;lastPortion=portion;
    }
    if(last&&(dirty||shape!==lastShape)){
      const pos=geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        const x=pos.getX(i),z=pos.getZ(i),u=x/ref.width+.5,v=z/ref.height+.5;
        pos.setY(i,ref.topY(u,v)+(shape?.(x,z)||0)+.00075+rise(u,v));
      }
      pos.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
    }
    lastShape=shape;
  }
  return {mesh,update,rise,dispose(){color.dispose();heightMap.dispose();geometry.dispose();material.dispose();}};
}
