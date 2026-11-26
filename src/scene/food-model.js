import * as THREE from '../../node_modules/three/build/three.module.js';
import { canvasSurface as canvas2d } from './canvas-surface.js';
import { clamp } from '../shared/recipe.js';
import { crownHeight } from './bread-crown.js';
import { simitRing } from './simit-ring.js';

function outline(image,w=120){
  const h=Math.max(12,Math.round(w*image.height/image.width));
  const canvas=canvas2d(w,h),c=canvas.getContext('2d',{willReadFrequently:true});
  c.drawImage(image,0,0,w,h);
  const pixels=c.getImageData(0,0,w,h).data;
  const alpha=(u,v)=>{
    if(u<0||u>=1||v<0||v>=1)return 0;
    return pixels[(Math.floor(v*h)*w+Math.floor(u*w))*4+3]/255;
  };
  return {w,h,pixels,alpha};
}
// Trace the alpha contour in texture space. Each contour segment follows the same
// rounded profile, including the inner edge of the simit.
function sideGeometry(mask,width,height,depth,bread,topY,crown){
  const positions=[],colors=[],uvs=[],normals=[],indices=[],{w,h,alpha}=mask;
  const rings=crown ? [[1,0],[.7,-.001],[.16,-.001],[0,0]]
              : bread ? [[1,0],[.86,-depth*.055],[.64,-depth*.08],[.42,depth*.02],[.2,depth*.18],[.07,depth*.37],[0,depth*.60]]
                    : [[1,0],[.76,-.001],[.23,.001],[0,Math.min(.005,depth*.3)]];
  const inside=(x,y)=>x>=0&&x<w&&y>=0&&y<h&&mask.pixels[(y*w+x)*4+3]>=128;
  for(let j=-1;j<h;j++)for(let i=-1;i<w;i++){
    const filled=inside(i,j);
    if(inside(i+1,j)===filled&&inside(i+1,j+1)===filled&&inside(i,j+1)===filled)continue;
    const corners=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]].map(([x,y])=>[(x+.5)/w,(y+.5)/h]);
    const values=corners.map(([u,v])=>alpha(u,v)),cross=[];
    for(let k=0;k<4;k++){
      const n=(k+1)%4;if((values[k]>.50)===(values[n]>.50))continue;
      const t=(.50-values[k])/(values[n]-values[k]);
      const u=corners[k][0]+(corners[n][0]-corners[k][0])*t,v=corners[k][1]+(corners[n][1]-corners[k][1])*t;
      const du=alpha(u+1/w,v)-alpha(u-1/w,v),dv=alpha(u,v+1/h)-alpha(u,v-1/h),length=Math.hypot(du,dv)||1;
      cross.push({u,v,nx:du/length,nz:dv/length,angle:Math.atan2(v-.5,u-.5)/(Math.PI*2)+.5});
    }
    for(let k=0;k+1<cross.length;k+=2){
      let a=cross[k],b=cross[k+1];
      if((b.v-a.v)*height*(a.nx+b.nx)<(b.u-a.u)*width*(a.nz+b.nz))[a,b]=[b,a];
      if(Math.abs(a.angle-b.angle)>.5){if(a.angle<b.angle)a.angle++;else b.angle++;}
      const start=positions.length/3;
      for(const v of [a,b]){
        const {u,nx,nz}=v,heightAtEdge=topY(u,v.v);
        for(let index=0;index<rings.length;index++){
          const [fraction,inset]=rings[index];
          positions.push((u-.5)*width+nx*inset,fraction*heightAtEdge,(v.v-.5)*height+nz*inset);
          const prev=rings[Math.max(0,index-1)],next=rings[Math.min(rings.length-1,index+1)];
          const slope=(next[1]-prev[1])/((next[0]-prev[0])*depth);
          const length=Math.sqrt(nx*nx+slope*slope+nz*nz)||1;
          normals.push(-nx/length,slope/length,-nz/length);
          const shade=.87+.13*fraction;
          colors.push(shade,shade,shade);
          if(bread)uvs.push(v.angle,fraction);
          else{
            const bandWidth=.01+(1-fraction)*.047;
            uvs.push(u+nx*bandWidth,1-(v.v+nz*bandWidth));
          }
        }
      }
      for(let band=0;band<rings.length-1;band++){
        const left=start+band,right=left+rings.length;
        indices.push(left,left+1,right+1,left,right+1,right);
      }
    }
  }
  const geo=new THREE.BufferGeometry();geo.setIndex(indices);
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geo;
}
export function makeFood(map,width,depth,{crust=null,dome=false,rounded=false,egg=false,flex=false,cutFace=null,ring=false}={}){
  const image=map.image,height=width*image.height/image.width,mask=outline(image,ring?384:120),group=new THREE.Group();
  // Fit a smooth dome to the orange yolk. The white gleam in its photograph
  // is a reflection, so it must never become a depression in the mesh.
  let yolk;
  if(egg){
    let total=0,sx=0,sy=0,sxx=0,syy=0;
    for(let y=1;y<mask.h-1;y++)for(let x=1;x<mask.w-1;x++){
      const i=(y*mask.w+x)*4,[r,g,b,a]=mask.pixels.subarray(i,i+4);
      const u=x/mask.w,v=y/mask.h;
      if(a<200||r<160||g<65||r-g<45||g-b<50||u<.1||v<.1||u>.9||v>.9)continue;
      const weight=(r-b)/255;total+=weight;sx+=u*weight;sy+=v*weight;sxx+=u*u*weight;syy+=v*v*weight;
    }
    if(total){
      const x=sx/total,y=sy/total;
      yolk={x,y,rx:clamp(2*Math.sqrt(Math.max(0,sxx/total-x*x)),.16,.40),ry:clamp(2*Math.sqrt(Math.max(0,syy/total-y*y)),.16,.40)};
    }
  }
  const shell=ring&&simitRing(mask,width,height,depth,!!cutFace);
  const capHeight=shell?.topY||((cutFace||rounded)&&crownHeight(mask,depth));
  function topY(u,v){
    if(capHeight)return capHeight(u,v);
    if(dome)return depth*(.14+.86*Math.sqrt(Math.max(0,1-4*((u-.5)**2+(v-.5)**2))));
    if(!yolk)return depth;
    const r=((u-yolk.x)/yolk.rx)**2+((v-yolk.y)/yolk.ry)**2;
    return depth*(.16+.84*Math.exp(-1.22*r*r));
  }
  const segments=cutFace||rounded?64:dome||flex||egg?32:1;
  const geom=shell?shell.top:new THREE.PlaneGeometry(width,height,segments,segments);
  if(!shell){
    geom.rotateX(-Math.PI/2);const points=geom.attributes.position;
    for(let i=0;i<points.count;i++)points.setY(i,topY(points.getX(i)/width+.5,points.getZ(i)/height+.5));
    geom.computeVertexNormals();
  }
  const top=new THREE.Mesh(geom,new THREE.MeshLambertMaterial({map,alphaTest:shell?0:.48,side:THREE.DoubleSide}));
  top.castShadow=true;top.receiveShadow=true;
  const sides=new THREE.Mesh(shell?shell.sides:sideGeometry(mask,width,height,depth,!!crust,topY,!!cutFace),new THREE.MeshLambertMaterial({map:crust||map,vertexColors:!shell,side:THREE.DoubleSide}));
  sides.castShadow=true;sides.receiveShadow=true;group.add(top,sides);
  if(cutFace||shell){
    const bottom=shell?shell.bottom:new THREE.PlaneGeometry(width,height);
    const underside=new THREE.Mesh(bottom,new THREE.MeshLambertMaterial({
      map:cutFace||map,alphaTest:shell?0:.48,side:shell?THREE.FrontSide:THREE.BackSide}));
    if(!shell)bottom.rotateX(-Math.PI/2);
    underside.receiveShadow=true;group.add(underside);
  }
  const contacts=[];
  const contactGrid=cutFace?23:13;
  for(let row=0;row<contactGrid;row++)for(let col=0;col<contactGrid;col++){
    const u=(col+.5)/contactGrid,v=(row+.5)/contactGrid;
    if(mask.alpha(u,v)>.5)contacts.push([(u-.5)*width,(v-.5)*height]);
  }
  // Use the photograph's footprint, including non-square breads, to frame pictures.
  const perimeter=[];
  const rows=[];
  for(let j=0;j<mask.h;j+=2){
    let first=-1,last=-1;
    for(let i=0;i<mask.w;i+=2)if(mask.pixels[(j*mask.w+i)*4+3]>=128){
      if(first<0)first=i;
      last=i;
    }
    if(first>=0)rows.push({j,first,last});
  }
  for(let k=0;k<48;k++){
    const a=k*Math.PI/24,dx=Math.cos(a),dz=Math.sin(a);
    let best=-Infinity,px=0,pz=0;
    for(const {j,first,last} of rows){
      const z=((j+.5)/mask.h-.5)*height;
      // For a horizontal scanline the extreme lies at one end. On the
      // vertical axes retain the original tie order at floating-point precision.
      const end=dx>0?last:first,start=Math.abs(dx)<1e-12?first:end;
      for(let i=start;i<=end;i+=2){
        if(i!==first&&i!==last&&mask.pixels[(j*mask.w+i)*4+3]<128)continue;
        const x=((i+.5)/mask.w-.5)*width,dot=x*dx+z*dz;
        if(dot>best){best=dot;px=x;pz=z;}
      }
    }
    perimeter.push([px,pz]);
  }
  return {width,height,depth,mask,group,top,flex,topY,contacts,perimeter,image};
}
