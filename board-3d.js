import * as THREE from './node_modules/three/build/three.module.js';
import { images as teaImages } from './drawing.js?v=servings';
import { createPhotoFocus } from './photo-focus.js';
import { createDrinks } from './drinks.js?v=free-peel';
import { createTeaService } from './tea-glass.js?v=servings';
import { setTable, tableHeight, plateRadius, clothHeight } from './table-setting.js?v=kareli';
import { aimCamera, composePhoto, presetPose } from './photo-camera.js';
import { createCoating } from './food-marks.js?v=servings';
import { breads, cloths, ingredients, pantry, openingPercent, clamp, tableCoverFor, photoCoverFor, boundedCoverPose } from './recipe.js?v=free-peel';
import { simitRing } from './simit-ring.js';
import { crownHeight, crownPlacement, parkedCrown } from './bread-crown.js?v=plate-camera';


export const cameraNames={top:'Üstten',tilt:'Eğik',low:'Alçak',corner:'Köşeden'};
const surface=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const ray=new THREE.Raycaster(), point3=new THREE.Vector3();
const canvas2d=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function texture(source){
  const map=new THREE.CanvasTexture(source);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}
async function loadImage(asset){
  const img=new Image();img.src='./assets/'+asset+'.webp';await img.decode();return img;
}
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
  const positions=[],colors=[],uvs=[],normals=[],{w,h,alpha}=mask;
  const rings=crown ? [[1,0],[.7,-.001],[.16,-.001],[0,0]]
              : bread ? [[1,0],[.86,-depth*.055],[.64,-depth*.08],[.42,depth*.02],[.2,depth*.18],[.07,depth*.37],[0,depth*.60]]
                    : [[1,0],[.76,-.001],[.23,.001],[0,Math.min(.005,depth*.3)]];
  for(let j=-1;j<h;j++)for(let i=-1;i<w;i++){
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
      for(let band=0;band<rings.length-1;band++){
        for(const [v,index] of [[a,band],[a,band+1],[b,band+1],[a,band],[b,band+1],[b,band]]){
          const [fraction,inset]=rings[index],{u,nx,nz}=v;
          positions.push((u-.5)*width+nx*inset,fraction*topY(u,v.v),(v.v-.5)*height+nz*inset);
          const prev=rings[Math.max(0,index-1)],next=rings[Math.min(rings.length-1,index+1)];
          const slope=(next[1]-prev[1])/((next[0]-prev[0])*depth);
          const normal=new THREE.Vector3(-nx,slope,-nz).normalize();
          normals.push(normal.x,normal.y,normal.z);
          const shade=.87+.13*fraction;
          colors.push(shade,shade,shade);
          if(bread)uvs.push(v.angle,fraction);
          else{
            const bandWidth=.01+(1-fraction)*.047;
            uvs.push(u+nx*bandWidth,1-(v.v+nz*bandWidth));
          }
        }
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geo;
}
function makeFood(image,width,depth,{crust=null,dome=false,egg=false,flex=false,cutFace=null,ring=false}={}){
  const height=width*image.height/image.width,mask=outline(image,ring?384:120),group=new THREE.Group();
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
  const capHeight=shell?.topY||(cutFace&&crownHeight(mask,depth));
  function topY(u,v){
    if(capHeight)return capHeight(u,v);
    if(dome)return depth*(.14+.86*Math.sqrt(Math.max(0,1-4*((u-.5)**2+(v-.5)**2))));
    if(!yolk)return depth;
    const r=((u-yolk.x)/yolk.rx)**2+((v-yolk.y)/yolk.ry)**2;
    return depth*(.16+.84*Math.exp(-1.22*r*r));
  }
  const segments=cutFace?64:dome||flex||egg?32:1,map=texture(image);
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
      map:cutFace?texture(cutFace):map,alphaTest:shell?0:.48,side:shell?THREE.FrontSide:THREE.BackSide}));
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
  for(let k=0;k<48;k++){
    const a=k*Math.PI/24,dx=Math.cos(a),dz=Math.sin(a);
    let best=-Infinity,px=0,pz=0;
    for(let j=0;j<mask.h;j+=2)for(let i=0;i<mask.w;i+=2){
      const u=(i+.5)/mask.w,v=(j+.5)/mask.h;
      if(mask.alpha(u,v)<.5)continue;
      const x=(u-.5)*width,z=(v-.5)*height,dot=x*dx+z*dz;
      if(dot>best){best=dot;px=x;pz=z;}
    }
    perimeter.push([px,pz]);
  }
  return {width,height,depth,mask,group,top,flex,topY,contacts,perimeter,image};
}
function relative(p,x,z){
  const dx=x-p.x,dz=z-p.z,c=Math.cos(p.a),s=Math.sin(p.a);
  return [dx*c-dz*s,dx*s+dz*c];
}

export async function createBoard(canvas){
  const renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#615049');
  scene.fog=new THREE.FogExp2(0x615049,.048);
  const editorCamera=new THREE.OrthographicCamera(-1,1,1,-1,.01,24);
  const photoCamera=new THREE.PerspectiveCamera(35,1,.02,30),origin=new THREE.Vector3();
  let camera=editorCamera,photoSetup=null,framePixels=1;
  const sun=new THREE.DirectionalLight(0xfff5e7,1.65);sun.position.set(-2.3,5,-1.8);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-1.8,right:1.8,top:1.8,bottom:-1.8,near:.1,far:12});sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00014;sun.shadow.normalBias=.0005;sun.shadow.radius=2.5;
  scene.add(sun,new THREE.AmbientLight(0xffffff,1.55));
  const ids=new Set([...Object.values(cloths).map(c=>c.asset),'kahvalti-tabagi','tea-saucer','drink-art','milk-art','cay','sesame-crust','pogaca-crust','acma-crust','tas-ekmek-crust',...Object.values(breads).flatMap(b=>[b.asset,b.crown]),
    ...ingredients.filter(f=>f.kind==='topping'&&!f.drink).map(f=>f.asset||f.id),'smear-cream','smear-jam','servings','serving-relief']);
  const art=Object.fromEntries(await Promise.all(Array.from(ids).map(async id=>[id,await loadImage(id)])));
  teaImages.cay=art.cay;

  const clothMaps=Object.fromEntries(Object.entries(cloths).map(([id,c])=>[id,texture(art[c.asset])]));
  const {plate,setCloth}=setTable(scene,clothMaps,texture(art['kahvalti-tabagi']));
  const crusts=Object.fromEntries(Object.keys(breads).map(id=>{
    const map=texture(art[id==='simit'?'sesame-crust':id+'-crust']);map.wrapS=THREE.RepeatWrapping;
    if(id!=='simit')map.repeat.x=3;
    return [id,map];
  }));
  const loafCache=new Map(),crownCache=new Map(),coatings=new Map();
  let bread,breadId,lid;
  function activateBread(id='simit'){
    if(breadId===id)return;
    if(bread)bread.group.visible=false;
    if(!loafCache.has(id)){
      const spec=breads[id],food=makeFood(art[spec.asset],1,spec.depth,{crust:crusts[id],ring:id==='simit'});
      scene.add(food.group);loafCache.set(id,food);
    }
    bread=loafCache.get(id);breadId=id;bread.group.visible=true;
  }
  activateBread();
  const blanks={cay:createTeaService(renderer,art['tea-saucer']),...createDrinks(art['drink-art'],art['milk-art'])};
  for(const item of ingredients.filter(f=>f.kind==='topping'&&!f.drink&&!f.bread)){
    blanks[item.id]=makeFood(art[item.asset||item.id],item.size,item.depth,{
      dome:item.id.endsWith('-olive'),egg:item.id==='fried-egg'||item.id==='egg-slice',
      flex:['pastirma','parsley','kasar','onion','red-onion','fried-egg'].includes(item.id)
    });
  }
  // Shelf halves and the movable lid use the same undeformed bread model.
  function foodModel(id){
    if(blanks[id])return blanks[id];
    const loaf=pantry[id].bread,b=breads[loaf],ring=loaf==='simit';
    blanks[id]=makeFood(art[b.crown],1,b.crownDepth,{crust:crusts[loaf],cutFace:art[b.asset],ring,flex:ring});
    return blanks[id];
  }
  function pieceGroup(p){
    const ref=foodModel(p.food);
    return (ref.forOpening?.(openingPercent(p))??ref.forFill?.(p.dem,p.water)??ref.group).clone();
  }
  let recipe={strokes:[],pieces:[]},nodes=[],heights=[],offsets=[],ghost=null,hover=null,view=null,raf=0,clock=0;
  let orbit={yaw:0,elevation:Math.PI/2},editPose=null,photoLens='tilt';
  let editorAspect=1;
  const falls=[];
  const landing=new Map();

  const renderPhoto=createPhotoFocus(renderer);
  function render(gate=framePixels*renderer.getPixelRatio()){
    if(view)renderPhoto(scene,photoCamera,photoSetup,gate);
    else renderer.render(scene,editorCamera);
  }
  function subjectPoints(){
    const points=[];
    for(let i=0;i<64;i++){
      const a=i*Math.PI/32,x=plateRadius*Math.cos(a),z=plateRadius*Math.sin(a);
      points.push(new THREE.Vector3(x,.025,z));
    }
    function sample(ref,group){
      group.updateMatrixWorld(true);
      const add=(x,y,z)=>points.push(new THREE.Vector3(x,y,z).applyMatrix4(group.matrixWorld));
      for(const [x,z] of ref.perimeter){add(x,0,z);add(x,ref===blanks.cay ? .025 : ref.depth,z);}
      if(ref===blanks.cay){
        for(let i=0;i<16;i++){const a=i*Math.PI/8;add(.068*Math.cos(a),ref.depth,.068*Math.sin(a));}
      }else add(0,ref.depth,0);
      if(group.userData.openBounds){
        const [min,max]=group.userData.openBounds;
        for(const x of [min[0],max[0]])for(const z of [min[2],max[2]])add(x,max[1],z);
      }
    }
    sample(bread,bread.group);
    recipe.pieces.forEach((p,i)=>{
      if(!pantry[p.food].bread||recipe.photoCover||Math.hypot(p.x,p.z)<=plateRadius)sample(foodModel(p.food),nodes[i]);
    });
    // A spare on the cloth is scenery in the normal plate portrait. An
    // explicit cover composition can include the whole spare in the shot.
    if(lid?.group.visible&&(recipe.photoCover||Math.hypot(lid.group.position.x,lid.group.position.z)<=plateRadius)){
      sample(lid,lid.group);
    }
    return points;
  }
  function cameraPosition(){
    if(view)aimCamera(photoCamera,orbit,photoSetup.target,photoSetup.distance);
    else aimCamera(editorCamera,orbit,origin,4);
    render();
  }
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);framePixels=Math.min(w*.91,h*.93);
    if(view){
      photoCamera.aspect=w/h;photoCamera.fov=THREE.MathUtils.radToDeg(2*Math.atan(photoSetup.tan*h/framePixels));
      photoCamera.updateProjectionMatrix();
    }else{
      const unit=Math.min(w,h)*.94/(2*plateRadius);
      editorCamera.left=-w/(2*unit);editorCamera.right=-editorCamera.left;
      editorCamera.top=h/(2*unit);editorCamera.bottom=-editorCamera.top;
      editorCamera.updateProjectionMatrix();
      if(editorAspect!==w/h){
        editorAspect=w/h;
        if(lid?.group.visible&&!recipe.coverPose&&!recipe.closed)placeCover();
      }
    }
    canvas.parentElement.style.setProperty('--frame',framePixels+'px');cameraPosition();
  }
  function photoPose(id){
    const pose=presetPose(id),drink=recipe.pieces.find(p=>p.food==='cay')||recipe.pieces.find(p=>pantry[p.food].drink);
    if(!drink||!['low','corner'].includes(id)||Math.hypot(drink.x,drink.z)<.30)return pose;
    // Keep the tall drink behind and beside the bread in the two lower shots.
    const direction=Math.atan2(drink.x,drink.z);
    const candidates=[pose.yaw,-pose.yaw,Math.PI+pose.yaw,Math.PI-pose.yaw];
    function cost(yaw){
      const separation=direction-yaw;
      const side=Math.sin(separation)*(id==='low'?-1:1);
      return Math.abs(Math.cos(separation)+.48)+Math.max(0,-side)*.25;
    }
    pose.yaw=candidates.reduce((best,yaw)=>cost(yaw)<cost(best)?yaw:best);return pose;
  }
  function setView(id){
    if(id&&!view){
      for(const p of landing.keys()){
        const i=recipe.pieces.indexOf(p);if(i>=0)position(nodes[i],p,heights[i]);
      }
      landing.clear();
      for(const fall of falls)scene.remove(fall.node);
      falls.length=0;
    }
    view=id;
    orbit=id?(id==='free'?{...(editPose||photoPose('tilt'))}:photoPose(id)):{...(editPose||presetPose('top'))};
    camera=id?photoCamera:editorCamera;
    photoLens=id==='free'?'tilt':id;
    refreshCover();
  }
  function refreshCover(){
    placeCover();
    if(view)photoSetup=composePhoto(subjectPoints(),orbit,photoLens);
    resize();
  }
  function rotate(dx,dy){
    orbit={yaw:(orbit.yaw-dx)%(Math.PI*2),elevation:clamp(orbit.elevation+dy,.20,Math.PI/2)};
    if(view)view='free';else editPose={...orbit};
    cameraPosition();
  }
  function setRay(clientX,clientY){
    const b=canvas.getBoundingClientRect();ray.setFromCamera({x:(clientX-b.left)/b.width*2-1,y:1-(clientY-b.top)/b.height*2},camera);
  }
  function xy(clientX,clientY,y){
    setRay(clientX,clientY);
    if(y===undefined){
      const hit=ray.intersectObject(plate,false)[0];
      if(hit)return {x:hit.point.x,z:hit.point.z};
      y=clothHeight;
    }
    surface.constant=-y;ray.ray.intersectPlane(surface,point3);return {x:point3.x,z:point3.z};
  }
  function pick(clientX,clientY,relief=true){
    setRay(clientX,clientY);
    const faces=[bread.top],indices=new Map([[bread.top,-1]]);
    if(relief&&bread.coating?.mesh.visible){faces.push(bread.coating.mesh);indices.set(bread.coating.mesh,-1);}
    nodes.forEach((node,i)=>{
      const id=recipe.pieces[i].food;
      const parts=id==='cay'?[node.getObjectByName('saucer'),node.getObjectByName('glass')]:[];
      if(id!=='cay'){
        if(pantry[id].drink)node.traverseVisible(part=>{if(part.isMesh)parts.push(part);});
        else parts.push(node.children[0]);
      }
      const coating=coatings.get(recipe.pieces[i]);
      if(relief&&coating?.mesh.visible)parts.push(coating.mesh);
      for(const face of parts){faces.push(face);indices.set(face,i);}
    });
    const hits=ray.intersectObjects(faces,false);
    for(const h of hits){
      const index=indices.get(h.object);
      const ref=index<0?bread:foodModel(recipe.pieces[index].food),u=h.uv.x,v=1-h.uv.y;
      const coat=index<0?bread.coating:coatings.get(recipe.pieces[index]);
      if(coat?.mesh===h.object&&coat.rise(u,v)<.0005)continue;
      if(!pantry[recipe.pieces[index]?.food]?.drink&&ref.mask.alpha(u,v)<.49)continue;
      return {i:index,u,v,x:h.point.x,z:h.point.z,y:h.point.y,distance:h.distance};
    }
    return null;
  }
  function screen(x,y,z){
    const p=new THREE.Vector3(x,y,z).project(camera);return {x:(p.x+1)*.5*canvas.clientWidth,y:(1-p.y)*.5*canvas.clientHeight};
  }
  function hasBread(x,z){return bread.mask.alpha(x/bread.width+.5,z/bread.height+.5)>.48;}
  function heightAt(x,z,count,exclude){
    let high=hasBread(x,z)?bread.depth+(bread.coating?.rise(x/bread.width+.5,z/bread.height+.5)||0):tableHeight(x,z);
    for(let i=0;i<count;i++){
      if(i===exclude)continue;
      const p=recipe.pieces[i],food=foodModel(p.food),[lx,lz]=relative(p,x,z);
      const u=lx/food.width+.5,v=lz/food.height+.5;
      if(food.mask.alpha(u,v)<.47)continue;
      const offset=offsets[i]?.(lx,lz)||0;
      high=Math.max(high,heights[i]+offset+food.topY(u,v)+(coatings.get(p)?.rise(u,v)||0));
    }
    return high;
  }
  function support(p,count=recipe.pieces.length,exclude=-1,fit=false){
    const ref=foodModel(p.food),cs=Math.cos(p.a),sn=Math.sin(p.a);
    const samples=ref.contacts.map(([a,b])=>heightAt(p.x+a*cs+b*sn,p.z-a*sn+b*cs,count,exclude));
    const good=samples.filter(v=>v>=0),max=Math.max(...samples);
    const stable=!!pantry[p.food].bread||pantry[p.food].drink||good.length>=Math.max(1,samples.length*.28);
    if(!fit||ref.flex||pantry[p.food].drink||max-Math.min(...samples)<.003)return {stable,height:max+.001};
    const plane=restingPlane(ref.contacts,samples,.42);
    return {stable,height:plane.height+.001,offset:(x,z)=>plane.sx*x+plane.sz*z};
  }
  function restingPlane(contacts,samples,maxSlope){
    // A rigid slice can lean across two different contact heights. Find the
    // lowest gently tilted plane that clears the supports under its footprint.
    let sx=0,sz=0,height=Math.max(...samples),score=height;
    for(const step of [.25,.11,.045]){
      const startX=sx,startZ=sz;
      for(const dx of [-step,0,step])for(const dz of [-step,0,step]){
        const a=startX+dx,b=startZ+dz;if(Math.hypot(a,b)>maxSlope)continue;
        let base=-Infinity;
        for(let i=0;i<samples.length;i++)base=Math.max(base,samples[i]-contacts[i][0]*a-contacts[i][1]*b);
        const effort=base+.015*(a*a+b*b);
        if(effort<score){sx=a;sz=b;height=base;score=effort;}
      }
    }
    return {height,sx,sz};
  }
  function position(group,p,h){group.position.set(p.x,h,p.z);group.rotation.set(0,p.a,0);}
  function placeCover(){
    if(lid)lid.group.visible=false;
    const mode=view?photoCoverFor(recipe):tableCoverFor(recipe);
    if(mode==='open')return;
    if(!crownCache.has(breadId)){
      const ref=foodModel(breads[breadId].crown),group=ref.group.clone();
      if(breadId==='simit')for(const mesh of group.children)mesh.geometry=mesh.geometry.clone();
      const upper={...ref,group};
      upper.radius=.02+Math.max(...upper.perimeter.map(([x,z])=>Math.hypot(x,z)));
      crownCache.set(breadId,upper);scene.add(upper.group);
    }
    lid=crownCache.get(breadId);lid.group.visible=true;
    let pose;
    if(mode==='side')pose=parkedCrown(lid,plateRadius,editorAspect);
    else if(mode==='custom')pose=(view&&recipe.photoCover==='custom'&&recipe.photoCoverPose)||recipe.coverPose;
    else pose=crownPlacement(mode,bread,lid,recipe.pieces,blanks);
    settleCover(pose,mode==='half'||mode==='custom' ? .48 : .28);
  }
  function settleCover({x,z,yaw},maxSlope){
    if(breadId==='simit'){
      // The sliced ring yields over a filling rather than balancing the whole
      // crown on the highest olive. Reuse the topping contact solver at a
      // shallower slope, with original vertices so dragging cannot accumulate bends.
      const onCloth=Math.hypot(x,z)>plateRadius+lid.radius&&recipe.pieces.every(p=>{
        const ref=foodModel(p.food);
        return Math.hypot(x-p.x,z-p.z)>lid.radius+Math.hypot(ref.width,ref.height)/2;
      });
      // A ring lying flat on the cloth keeps the original mesh, including
      // through repeated ingredient edits and drags around the parked spot.
      const bend=onCloth?null:drape({x,z,a:yaw},recipe.pieces.length,0,lid,.32);
      if(bend||lid.bend){
        for(const mesh of lid.group.children){
          const vertices=mesh.geometry.attributes.position;
          const original=mesh.userData.unbentY??=Float32Array.from({length:vertices.count},(_,i)=>vertices.getY(i));
          for(let i=0;i<vertices.count;i++){
            vertices.setY(i,original[i]+(bend?bend(vertices.getX(i),vertices.getZ(i)):0));
          }
          vertices.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
        }
      }
      lid.bend=bend;lid.group.position.set(x,onCloth?clothHeight+.00085:-.00035,z);lid.group.rotation.set(0,yaw,0);
      return;
    }
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const samples=lid.contacts.map(([lx,lz])=>heightAt(x+c*lx+s*lz,z-s*lx+c*lz,recipe.pieces.length,-1));
    const plane=restingPlane(lid.contacts,samples,maxSlope);
    lid.group.position.set(x,plane.height-.0004,z);
    lid.group.rotation.set(-Math.atan(plane.sz),yaw,Math.atan(plane.sx),'YXZ');
  }
  function coverPose(){
    if(!lid?.group.visible)return null;
    return {x:lid.group.position.x,z:lid.group.position.z,yaw:lid.group.rotation.y};
  }
  function covers(x,z){
    const pose=coverPose();if(!pose)return false;
    const [lx,lz]=relative({x:pose.x,z:pose.z,a:pose.yaw},x,z);
    return lid.mask.alpha(lx/lid.width+.5,lz/lid.height+.5)>=.49;
  }
  function coverHandle(){
    if(!coverPose())return null;
    const [x,z]=lid.perimeter[0];
    const edge=lid.group.localToWorld(new THREE.Vector3(x,lid.topY(x/lid.width+.5,z/lid.height+.5)+(lid.bend?.(x,z)||0),z));
    const point=screen(edge.x,edge.y,edge.z),center=screen(lid.group.position.x,edge.y,lid.group.position.z);
    const dx=point.x-center.x,dy=point.y-center.y,length=Math.hypot(dx,dy)||1;
    return {x:clamp(point.x+16*dx/length,23,canvas.clientWidth-23),y:clamp(point.y+16*dy/length,23,canvas.clientHeight-23),height:edge.y};
  }
  function pickCover(clientX,clientY){
    if(!coverPose())return null;
    setRay(clientX,clientY);
    const hits=ray.intersectObjects(lid.group.children,false);
    const hit=hits.find(h=>h.object===lid.group.children[1]||lid.mask.alpha(h.uv.x,1-h.uv.y)>=.49);
    if(!hit)return null;
    // The glass, a filling or the plate can be in front of the crust in a low shot.
    const foreground=pick(clientX,clientY);
    if(foreground&&foreground.distance<hit.distance-.001)return null;
    const rim=ray.intersectObject(plate,false)[0];
    if(rim&&rim.distance<hit.distance-.001)return null;
    const anchor=lid.group.worldToLocal(hit.point.clone());anchor.y-=lid.bend?.(anchor.x,anchor.z)||0;return anchor;
  }
  function coverPlanePoint(clientX,clientY,height){
    setRay(clientX,clientY);surface.constant=-height;
    if(ray.ray.direction.y>-.015||!ray.ray.intersectPlane(surface,point3))return null;
    return {x:point3.x,z:point3.z};
  }
  function dragCover(anchor,clientX,clientY){
    // Keep the particular spot the player grabbed under the pointer, even as
    // the top settles off a tall filling onto the plate in an oblique shot.
    const rect=canvas.getBoundingClientRect();
    clientX=clamp(clientX,rect.left+8,rect.right-8);
    clientY=clamp(clientY,rect.top+8,rect.bottom-8);
    for(let pass=0;pass<2;pass++){
      const contact=anchor.clone();contact.y+=lid.bend?.(contact.x,contact.z)||0;
      const held=lid.group.localToWorld(contact),at=coverPlanePoint(clientX,clientY,held.y);
      if(!at)break;
      const dx=at.x-held.x,dz=at.z-held.z;
      if(Math.hypot(dx,dz)<.0008)break;
      const pose=coverPose();
      settleCover(boundedCoverPose({x:pose.x+dx,z:pose.z+dz,yaw:pose.yaw}),.48);
    }
    render();
  }
  function drape(p,index,base,ref=foodModel(p.food),stiff=p.food===breads.simit.crown ? .32 : p.food==='kasar' ? .50 : p.food.includes('onion') ? .70 : .9){
    const c=Math.cos(p.a),s=Math.sin(p.a);
    const ring=!p.food||p.food===breads.simit.crown;
    const steps=28,stride=steps+1,grid=new Float32Array(stride*stride);
    // A nearby high spot lifts a region of the slice through its own stiffness.
    // Propagate those contact heights, then relax the surface between contacts.
    for(let row=0;row<=steps;row++)for(let col=0;col<=steps;col++){
      const x=(col/steps-.5)*ref.width,z=(row/steps-.5)*ref.height;
      grid[row*stride+col]=ring&&ref.mask.alpha(col/steps,row/steps)<.45?clothHeight:heightAt(p.x+x*c+z*s,p.z-x*s+z*c,index,-1);
    }
    const dx=ref.width/steps*stiff,dz=ref.height/steps*stiff,diagonal=Math.hypot(dx,dz);
    function sweep(start,end,dir){
      for(let row=start;row!==end;row+=dir)for(let col=start;col!==end;col+=dir){
        const i=row*stride+col;let y=grid[i];
        if(col!==start)y=Math.max(y,grid[i-dir]-dx);
        if(row!==start){
          y=Math.max(y,grid[i-dir*stride]-dz);
          if(col!==start)y=Math.max(y,grid[i-dir*(stride+1)]-diagonal);
          if(col+dir!==end)y=Math.max(y,grid[i-dir*(stride-1)]-diagonal);
        }
        grid[i]=y;
      }
    }
    sweep(0,stride,1);sweep(steps,-1,-1);
    const smooth=grid.slice();
    for(let row=1;row<steps;row++)for(let col=1;col<steps;col++){
      const i=row*stride+col;
      smooth[i]=(grid[i]*4+grid[i-1]+grid[i+1]+grid[i-stride]+grid[i+stride])/8;
    }
    return (x,z)=>{
      const u=clamp((x/ref.width+.5)*steps,0,steps),v=clamp((z/ref.height+.5)*steps,0,steps);
      const ix=Math.min(steps-1,Math.floor(u)),iz=Math.min(steps-1,Math.floor(v)),i=iz*stride+ix;
      const a=u-ix,b=v-iz;
      const near=smooth[i]*(1-a)+smooth[i+1]*a,far=smooth[i+stride]*(1-a)+smooth[i+stride+1]*a;
      return near*(1-b)+far*b+.0012-base;
    };
  }
  function conform(group,offset){
    for(const mesh of group.children){
      mesh.geometry=mesh.geometry.clone();
      const vertices=mesh.geometry.attributes.position;
      for(let i=0;i<vertices.count;i++)vertices.setY(i,vertices.getY(i)+offset(vertices.getX(i),vertices.getZ(i)));
      vertices.needsUpdate=true;
      if(mesh===group.children[0])mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
    group.userData.draped=true;
  }
  function sync(r,settle=false){
    recipe=r;setCloth(r.cloth);activateBread(r.bread);landing.clear();
    for(const n of nodes){
      scene.remove(n);
      const coating=n.children.at(-1);if(coating?.userData.coating)n.remove(coating);
      if(n.userData.draped)for(const mesh of n.children)mesh.geometry.dispose();
    }
    const present=new Set(r.pieces);
    for(const [p,coat] of coatings)if(!present.has(p)){
      coat.dispose();coatings.delete(p);
    }
    paintLoaf(r.strokes);
    nodes=[];heights=[];offsets=[];
    for(let i=0;i<r.pieces.length;i++){
      const p=r.pieces[i],ref=foodModel(p.food),{height,stable,offset}=support(p,i,-1,true);
      if(settle&&!stable){r.pieces.splice(i--,1);slip(p);continue;}
      const g=pieceGroup(p);
      const shape=ref.flex?drape(p,i,height):offset;
      if(shape)conform(g,shape);
      offsets.push(shape);
      heights.push(height);position(g,p,height);scene.add(g);nodes.push(g);paintPiece(p,i);
    }
    placeCover();
    render();
  }
  function paintLoaf(strokes){
    if(!bread.coating){
      if(!strokes.length)return;
      bread.coating=createCoating(bread,art);bread.group.add(bread.coating.mesh);
    }
    bread.coating.update(strokes);
  }
  function paintPiece(p,i){
    let coat=coatings.get(p);
    if(!coat){
      if(!p.marks?.length)return;
      coat=createCoating(foodModel(p.food),art);coat.mesh.userData.coating=true;coatings.set(p,coat);
    }
    coat.update(p.marks||[],offsets[i]);
    if(coat.mesh.parent!==nodes[i])nodes[i].add(coat.mesh);
  }
  function paintBread(strokes){
    paintLoaf(strokes);recipe.pieces.forEach(paintPiece);render();
  }
  function step(ms){
    clock+=ms;let moving=false;
    for(const [p,start] of landing){
      const i=recipe.pieces.indexOf(p),t=clamp((clock-start)/270,0,1);
      if(i<0||t===1){if(i>=0)position(nodes[i],p,heights[i]);landing.delete(p);continue;}
      const lift=.105*(1-t*t)*Math.max(0,1-t*1.45)+.011*Math.abs(Math.sin(t*13))*Math.pow(1-t,2);
      nodes[i].position.y=heights[i]+lift;nodes[i].rotation.z=.068*Math.sin(t*Math.PI*2)*(1-t);moving=true;
    }
    for(let i=falls.length-1;i>=0;i--){
      const fall=falls[i],t=clamp((clock-fall.start)/430,0,1),g=fall.node;
      g.position.x=fall.x+fall.dx*t*.20;g.position.z=fall.z+fall.dz*t*.20;
      g.position.y=.13*(1-t*t);g.rotation.z=t*.93;g.scale.setScalar(1-.78*t*t);
      if(t>=1){scene.remove(g);falls.splice(i,1);}else moving=true;
    }
    render();return moving;
  }
  function run(){
    if(raf)return;let last=performance.now();
    function animate(now){raf=0;const again=step(Math.min(50,now-last));last=now;if(again)raf=requestAnimationFrame(animate);}
    raf=requestAnimationFrame(animate);
  }
  function lift(p,hide=-1,swing=0){
    if(hover!==null && nodes[hover])nodes[hover].visible=true;
    hover=hide<0?null:hide;if(hover!==null)nodes[hover].visible=false;
    const opening=p?openingPercent(p):0;
    if(ghost&&(ghost.userData.food!==p?.food||ghost.userData.opening!==opening)){scene.remove(ghost);ghost=null;}
    if(p){
      if(!ghost){ghost=pieceGroup(p);ghost.userData.food=p.food;ghost.userData.opening=opening;scene.add(ghost);}
      const coat=hide>=0&&coatings.get(recipe.pieces[hide]);
      if(ghost.children.at(-1)?.userData.coating && ghost.children.at(-1).geometry!==coat?.mesh.geometry)ghost.remove(ghost.children.at(-1));
      if(coat&&!ghost.children.at(-1)?.userData.coating)ghost.add(coat.mesh.clone());
      position(ghost,p,support(p,recipe.pieces.length,hide).height+.10);
      ghost.rotation.z=clamp(swing,-.21,.21)+.035*Math.sin(10*p.x+3*p.z);
    } render();
  }
  function slip(p){

    const g=pieceGroup(p);position(g,p,.1);scene.add(g);
    const length=Math.hypot(p.x,p.z)||1;
    falls.push({node:g,start:clock,x:p.x,z:p.z,dx:p.x/length,dz:p.z/length});run();
  }
  function capture(){
    // Render the square gate at the actual export resolution, even on a phone.
    const out=canvas2d(960,960),size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
    const fov=photoCamera.fov,aspect=photoCamera.aspect;
    try{
      renderer.setPixelRatio(1);renderer.setSize(960,960,false);
      photoCamera.aspect=1;photoCamera.fov=THREE.MathUtils.radToDeg(2*Math.atan(photoSetup.tan));
      photoCamera.updateProjectionMatrix();render(960);out.getContext('2d').drawImage(canvas,0,0);
    }finally{
      renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);
      photoCamera.fov=fov;photoCamera.aspect=aspect;photoCamera.updateProjectionMatrix();render();
    }
    return out;
  }
  paintBread([]);new ResizeObserver(resize).observe(canvas);resize();
  return {sync,xy,pick,support,lift,slip,paintBread,step,capture,setView,rotate,refreshCover,
    coverPose,coverHandle,pickCover,covers,coverPlanePoint,dragCover,
    drinkService(id){return foodModel(id).service();},
    adjustCover(pose){settleCover(boundedCoverPose(pose),.48);render();},
    restoreCover(){placeCover();render();},
    changeCloth(id){setCloth(id);render();},
    pose(){return {...orbit};},hasEditPose(){return !!editPose;},
    resetOrbit(){editPose=null;setView(view?'tilt':null);},
    drinkSpot(id){
      const radius=foodModel(id).width/2;
      for(const ring of [Math.hypot(.48,.32),.77,.95]){
        for(let i=0;i<16;i++){
          const angle=Math.atan2(.32,.48)+i*Math.PI/8,x=ring*Math.cos(angle),z=ring*Math.sin(angle);
          if(!covers(x,z)&&recipe.pieces.every(p=>Math.hypot(x-p.x,z-p.z)>radius+foodModel(p.food).width/2+.025))return {x,z};
        }
      }
      return null;
    },
    landingSpot(n){
      for(let k=0;k<32;k++){
        const angle=(n+k)*2.39996+.25,x=.29*Math.cos(angle),z=.27*Math.sin(angle);
        if(hasBread(x,z)&&!covers(x,z))return {x,z};
      }
      return null;
    },
    breadUV(x,z){return {i:-1,u:x/bread.width+.5,v:z/bread.height+.5,x,z};},
    land(p){landing.set(p,clock);run();},

    handle(i){
      const p=recipe.pieces[i];if(!p)return null;
      const ref=foodModel(p.food),edge=ref.width*.5,height=heights[i]+ref.depth+(offsets[i]?.(edge,0)||0);
      const at=screen(p.x+Math.cos(p.a)*edge,height,p.z-Math.sin(p.a)*edge);
      if(pantry[p.food].bread||pantry[p.food].drink){at.x=clamp(at.x,23,canvas.clientWidth-23);at.y=clamp(at.y,23,canvas.clientHeight-23);}
      return {...at,height};
    }
  };
}
