import * as THREE from './node_modules/three/build/three.module.js';
import { canvasSurface as canvas2d } from './canvas-surface.js';
import { art, prepareArt, recipeArt } from './board-art.js';
import { images as teaImages } from './drawing.js?v=servings';
import { createPhotoFocus } from './photo-focus.js';
import { createDrinkFactory } from './drinks.js?v=perf';
import { createTeaService } from './tea-glass.js?v=servings';
import { setTable, tableHeight, plateRadius, clothHeight } from './table-setting.js?v=gazete';
import { aimCamera, composePhoto, fitEditorCamera, presetPose } from './photo-camera.js';
import { createFoodPicker, intersectStrips, outsideFootprint, pickTarget } from './food-picker.js';
import { createCoating } from './food-marks.js?v=salca';
import { breads, cloths, emptyRecipe, pantry, openingPercent, sliceThickness, localX, clamp, round, tableCoverFor, photoCoverFor, boundedCoverPose } from './recipe.js?v=gazete';
import { simitRing } from './simit-ring.js';
import { crownHeight, crownPlacement, parkedCrown } from './bread-crown.js?v=slices';

export {cameraNames} from './recipe.js?v=gazete';

const surface=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const ray=new THREE.Raycaster(), point3=new THREE.Vector3();
function texture(source){
  const map=new THREE.CanvasTexture(source);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
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
function makeFood(map,width,depth,{crust=null,dome=false,rounded=false,egg=false,flex=false,cutFace=null,ring=false}={}){
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
function relative(p,x,z){
  const dx=x-p.x,dz=z-p.z,c=Math.cos(p.a),s=Math.sin(p.a);
  return [localX(p,dx*c-dz*s),dx*s+dz*c];
}

export async function createBoard(canvas,initial=emptyRecipe(),printOnly=false){
  const loading=prepareArt(recipeArt(initial));
  const renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(printOnly?1:Math.min(devicePixelRatio||1,1.75));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#615049');
  scene.fog=new THREE.FogExp2(0x615049,.048);
  const editorCamera=new THREE.OrthographicCamera(-1,1,1,-1,.01,24);
  const photoCamera=new THREE.PerspectiveCamera(35,1,.02,30);
  let camera=editorCamera,photoSetup=null,framePixels=1;
  const sun=new THREE.DirectionalLight(0xfff5e7,1.65);sun.position.set(-2.3,5,-1.8);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-1.8,right:1.8,top:1.8,bottom:-1.8,near:.1,far:12});sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00014;sun.shadow.normalBias=.0005;sun.shadow.radius=2.5;
  scene.add(sun,new THREE.AmbientLight(0xffffff,1.55));
  await loading;
  const maps=new Map();
  function assetTexture(id){
    if(!maps.has(id))maps.set(id,texture(art[id]));
    return maps.get(id);
  }
  const {plate,setCloth}=setTable(scene,id=>assetTexture(cloths[id].asset),assetTexture('kahvalti-tabagi'));
  function crustFor(id){
    const map=assetTexture(id==='simit'?'sesame-crust':id+'-crust');
    map.wrapS=THREE.RepeatWrapping;if(id!=='simit')map.repeat.x=3;
    return map;
  }
  const loafCache=new Map(),crownCache=new Map(),coatings=new Map();
  let bread,breadId,lid;
  function activateBread(id='simit'){
    if(breadId===id)return;
    if(bread)bread.group.visible=false;
    if(!loafCache.has(id)){
      const spec=breads[id],food=makeFood(assetTexture(spec.asset),1,spec.depth,{crust:crustFor(id),ring:id==='simit'});
      scene.add(food.group);loafCache.set(id,food);
    }
    bread=loafCache.get(id);breadId=id;bread.group.visible=true;
  }
  const blanks={};
  const drinkFactories=new Map();
  // Shelf halves and the movable lid use the same undeformed bread model.
  function foodModel(id){
    if(blanks[id])return blanks[id];
    const item=pantry[id];
    if(id==='cay'){teaImages.cay=art.cay;blanks[id]=createTeaService(renderer,art['tea-saucer'],art['tea-light']);}
    else if(item.drink){
      const atlas=id.endsWith('-sut')?'milk-art':'drink-art';
      if(!drinkFactories.has(atlas))drinkFactories.set(atlas,createDrinkFactory(art['drink-art'],art['milk-art']));
      blanks[id]=drinkFactories.get(atlas)(id);
    }
    else if(item.bread){
      const b=breads[item.bread],ring=item.bread==='simit';
      blanks[id]=makeFood(assetTexture(b.crown),1,b.crownDepth,{crust:crustFor(item.bread),cutFace:assetTexture(b.asset),ring,flex:ring});
    }else blanks[id]=makeFood(assetTexture(item.asset||id),item.size,item.depth,{
      dome:id.endsWith('-olive'),rounded:id==='avokado'||id==='yogurt',egg:id==='fried-egg'||id==='egg-slice',
      flex:['pastirma','parsley','kasar','onion','red-onion','fried-egg'].includes(id)
    });
    return blanks[id];
  }
  const sliceModels=new Map();
  function modelFor(p){
    const base=foodModel(p.food);
    if(!p.thickness&&!p.taper)return base;
    const key=[p.food,p.thickness||'regular',!!p.taper].join('/');
    if(!sliceModels.has(key)){
      const depth=sliceThickness[p.thickness||'regular'].scale,width=p.taper ? .71 : 1;
      const group=base.group.clone();
      for(const mesh of group.children)mesh.geometry=mesh.geometry.clone().scale(width,depth,width);
      const scaled=points=>points.map(([x,z])=>[x*width,z*width]);
      sliceModels.set(key,{...base,group,top:group.children[0],width:base.width*width,height:base.height*width,depth:base.depth*depth,
        topY:(u,v)=>base.topY(u,v)*depth,perimeter:scaled(base.perimeter),contacts:scaled(base.contacts)});
    }
    return sliceModels.get(key);
  }
  function pieceTemplate(p,ref=modelFor(p)){
    return ref.forOpening?.(openingPercent(p))??ref.forFill?.(p.dem,p.water)??ref.group;
  }
  let recipe={strokes:[],pieces:[]},nodes=[],heights=[],offsets=[],ghost=null,ghostModel=null,hover=null,view=null,raf=0,clock=0;
  const placed=[];
  const nearestFood=createFoodPicker();
  let selectionTargets=null;
  let supportBread=null,breadMarks='';
  let orbit={yaw:0,elevation:Math.PI/2},editPose=null,photoLens='tilt';
  let editorAspect=1;
  const falls=[];
  const landing=new Map();

  const photoFocus=createPhotoFocus(renderer);
  let cameraFrame=0;
  function render(gate=framePixels*renderer.getPixelRatio(),shadowsChanged=true){
    if(cameraFrame){cancelAnimationFrame(cameraFrame);cameraFrame=0;}
    if(shadowsChanged)renderer.shadowMap.needsUpdate=true;
    if(view)photoFocus.render(scene,photoCamera,photoSetup,gate);
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
        for(let i=0;i<16;i++){const a=i*Math.PI/8;add(ref.rimRadius*Math.cos(a),ref.depth,ref.rimRadius*Math.sin(a));}
      }else add(0,ref.depth,0);
      if(group.userData.openBounds){
        const [min,max]=group.userData.openBounds;
        for(const x of [min[0],max[0]])for(const z of [min[2],max[2]])add(x,max[1],z);
      }
    }
    if(bread.group.visible)sample(bread,bread.group);
    recipe.pieces.forEach((p,i)=>{
      if(!pantry[p.food].bread||recipe.photoCover||Math.hypot(p.x,p.z)<=plateRadius)sample(modelFor(p),nodes[i]);
    });
    // A spare on the cloth is scenery in the normal plate portrait. An
    // explicit cover composition can include the whole spare in the shot.
    if(lid?.group.visible&&(recipe.photoCover||Math.hypot(lid.group.position.x,lid.group.position.z)<=plateRadius)){
      sample(lid,lid.group);
    }
    return points;
  }
  const editorBoxes=[];
  let maxFocusHeight=0;
  function measureEditor(){
    editorBoxes.length=0;
    let stackHeight=0;
    // The bottom bread fits inside the plate. The untouched spare rests on the cloth.
    nodes.forEach((node,i)=>{
      const box=new THREE.Box3().setFromObject(node);
      editorBoxes.push(box);
      stackHeight=Math.max(stackHeight,pantry[recipe.pieces[i].food].drink?heights[i]:box.max.y);
    });
    if(lid?.group.visible&&tableCoverFor(recipe)!=='side'){
      // Use the crust outline so a transparent corner cannot zoom out a turned lid.
      const bounds=new THREE.Box3().setFromObject(lid.group),outline=new THREE.Box3(),point=new THREE.Vector3();
      for(const [x,z] of lid.perimeter){
        outline.expandByPoint(point.set(x,0,z).applyMatrix4(lid.group.matrixWorld));
        outline.expandByPoint(point.set(x,lid.depth,z).applyMatrix4(lid.group.matrixWorld));
      }
      outline.min.y=bounds.min.y;outline.max.y=bounds.max.y;
      editorBoxes.push(outline);stackHeight=Math.max(stackHeight,bounds.max.y);
    }
    const stackBlend=THREE.MathUtils.smoothstep(stackHeight,.28,1.18);
    maxFocusHeight=.5*stackHeight*stackBlend;
    if(!editPose)orbit={yaw:0,elevation:Math.PI/2-.88*stackBlend};
  }
  function cameraPosition(){
    if(view)aimCamera(photoCamera,orbit,photoSetup.target,photoSetup.distance);
    else if(viewportWidth&&viewportHeight)fitEditorCamera(editorCamera,orbit,editorBoxes,viewportWidth,viewportHeight,plateRadius,maxFocusHeight);
  }
  let viewportWidth=0,viewportHeight=0;
  function resize(draw=true){
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    if(w!==viewportWidth||h!==viewportHeight){
      renderer.setSize(w,h,false);viewportWidth=w;viewportHeight=h;
    }
    framePixels=Math.min(w*.91,h*.93);
    if(view){
      photoCamera.aspect=w/h;photoCamera.fov=THREE.MathUtils.radToDeg(2*Math.atan(photoSetup.tan*h/framePixels));
      photoCamera.updateProjectionMatrix();
    }else{
      if(editorAspect!==w/h){
        editorAspect=w/h;
        if(lid?.group.visible&&!recipe.coverPose&&!recipe.closed)placeCover();
      }
      measureEditor();
    }
    canvas.parentElement.style.setProperty('--frame',framePixels+'px');cameraPosition();
    if(draw)render();
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
  function setView(id,saved){
    if(id&&!view){
      for(const p of landing.keys()){
        const i=recipe.pieces.indexOf(p);if(i>=0){position(nodes[i],p,heights[i]);invalidatePose(i);}
      }
      landing.clear();
      for(const fall of falls)scene.remove(fall.node);
      falls.length=0;
    }
    view=id;
    orbit=id?(id==='free'?{...(editPose||photoPose('tilt'))}:photoPose(id)):{...(editPose||presetPose('top'))};
    camera=id?photoCamera:editorCamera;
    photoLens=id==='free'?'tilt':id;
    if(saved?.pose)orbit={...saved.pose};
    if(saved?.frame)editorAspect=saved.frame.aspect;
    else if(printOnly)editorAspect=canvas.clientWidth/canvas.clientHeight||1;
    placeCover();
    if(saved?.frame){
      const {target,distance,tan}=saved.frame;
      photoSetup={target:new THREE.Vector3(...target),distance,tan};
    }else if(view)photoSetup=composePhoto(subjectPoints(),orbit,photoLens);
    if(printOnly){cameraPosition();renderer.shadowMap.needsUpdate=true;}else resize();
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
    if(!cameraFrame)cameraFrame=requestAnimationFrame(()=>{cameraFrame=0;render(undefined,false);});
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
  function pick(clientX,clientY,grab=true){
    setRay(clientX,clientY);
    if(!selectionTargets){
      selectionTargets=[];
      if(bread.group.visible)selectionTargets.push(pickTarget(bread.group,bread,-1,breadId,false,bread.coating));
      for(const entry of placed){
        const {i,ref,piece}=entry;
        entry.pickTarget??=pickTarget(nodes[i],ref,i,piece.food,pantry[piece.food].drink,coatings.get(piece));
        selectionTargets.push(entry.pickTarget);
      }
    }
    const hit=nearestFood(ray,selectionTargets,grab);
    return hit&&grab&&behindPlate(hit.y,hit.distance)?null:hit;
  }
  function behindPlate(y,distance){
    if(!plate.geometry.boundingBox)plate.geometry.computeBoundingBox();
    if(y>plate.geometry.boundingBox.max.y)return false;
    const hits=[];
    intersectStrips(ray,plate,hits);
    return hits.length>0&&hits[0].distance<distance-.001;
  }
  function screen(x,y,z){
    const p=new THREE.Vector3(x,y,z).project(camera);return {x:(p.x+1)*.5*canvas.clientWidth,y:(1-p.y)*.5*canvas.clientHeight};
  }
  function hasBread(x,z){return bread.group.visible&&bread.mask.alpha(x/bread.width+.5,z/bread.height+.5)>.48;}
  // A slice takes hundreds of contact samples over the same small footprint.
  // Discard distant supports once before evaluating those points.
  function nearbySupports(p,ref,count,exclude=-1){
    const c=Math.abs(Math.cos(p.a)),s=Math.abs(Math.sin(p.a));
    const halfWidth=(c*ref.width+s*ref.height)/2+1e-9;
    const halfDepth=(s*ref.width+c*ref.height)/2+1e-9;
    const nearby=[];
    for(let i=0;i<count;i++){
      const entry=placed[i];if(i===exclude)continue;
      if(Math.abs(p.x-entry.piece.x)<=halfWidth+entry.extentX&&Math.abs(p.z-entry.piece.z)<=halfDepth+entry.extentZ)nearby.push(entry);
    }
    return nearby;
  }
  function heightAt(x,z,supports=placed){
    let high=hasBread(x,z)?bread.depth+(bread.coating?.rise(x/bread.width+.5,z/bread.height+.5)||0):tableHeight(x,z);
    for(const {piece:p,ref:food,i,c,s,extentX,extentZ} of supports){
      const dx=x-p.x,dz=z-p.z;
      if(Math.abs(dx)>extentX||Math.abs(dz)>extentZ)continue;
      const lx=localX(p,dx*c-dz*s),lz=dx*s+dz*c;
      const u=lx/food.width+.5,v=lz/food.height+.5;
      if(food.mask.alpha(u,v)<.47)continue;
      const offset=offsets[i]?.(lx,lz)||0;
      high=Math.max(high,heights[i]+offset+food.topY(u,v)+(coatings.get(p)?.rise(u,v)||0));
    }
    return high;
  }
  function support(p,count=recipe.pieces.length,exclude=-1,fit=false){
    const ref=modelFor(p),cs=Math.cos(p.a),sn=Math.sin(p.a);
    const nearby=nearbySupports(p,ref,count,exclude);
    const samples=ref.contacts.map(([x,z])=>{const a=localX(p,x);return heightAt(p.x+a*cs+z*sn,p.z-a*sn+z*cs,nearby);});
    const good=samples.filter(v=>v>=0),max=Math.max(...samples);
    const stable=!!pantry[p.food].bread||pantry[p.food].drink||good.length>=Math.max(1,samples.length*.28);
    if(!fit||ref.flex||pantry[p.food].drink||max-Math.min(...samples)<.003)return {stable,height:max+.001};
    const plane=restingPlane(ref.contacts,samples,.42);
    const offset=(plane.sx||plane.sz)?(x,z)=>plane.sx*x+plane.sz*z:null;
    return {stable,height:plane.height+.001,offset};
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
  function position(group,p,h){group.position.set(p.x,h,p.z);group.rotation.set(0,p.a,0);group.scale.x=localX(p,1);}
  function invalidatePose(i){
    if(placed[i]?.pickTarget)placed[i].pickTarget.dirty=true;
  }
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
    else pose=crownPlacement(mode,bread,lid,recipe.pieces,modelFor);
    settleCover(pose,mode==='half'||mode==='custom' ? .48 : .28);
  }
  function applyCrownShape(){
    const bend=lid.bend;
    if(bend===(lid.appliedBend??null))return;
    for(const mesh of lid.group.children){
      const vertices=mesh.geometry.attributes.position;
      const original=mesh.userData.unbentY??=Float32Array.from({length:vertices.count},(_,i)=>vertices.getY(i));
      for(let i=0;i<vertices.count;i++){
        vertices.setY(i,original[i]+(bend?bend(vertices.getX(i),vertices.getZ(i)):0));
      }
      vertices.needsUpdate=true;mesh.geometry.boundingBox=null;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
    }
    lid.appliedBend=bend;
  }
  function settleCover({x,z,yaw},maxSlope,deferMesh=false){
    if(breadId==='simit'){
      // The sliced ring yields over a filling rather than balancing the whole
      // crown on the highest olive. Reuse the topping contact solver at a
      // shallower slope, with original vertices so dragging cannot accumulate bends.
      const onCloth=Math.hypot(x,z)>plateRadius+lid.radius&&recipe.pieces.every(p=>{
        const ref=modelFor(p);
        return Math.hypot(x-p.x,z-p.z)>lid.radius+Math.hypot(ref.width,ref.height)/2;
      });
      // A ring lying flat on the cloth keeps the original mesh, including
      // through repeated ingredient edits and drags around the parked spot.
      const bend=onCloth?null:drape({x,z,a:yaw},recipe.pieces.length,0,lid,.32);
      lid.bend=bend;lid.group.position.set(x,onCloth?clothHeight+.00085:-.00035,z);lid.group.rotation.set(0,yaw,0);
      if(!deferMesh)applyCrownShape();
      return;
    }
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const nearby=nearbySupports({x,z,a:yaw},lid,recipe.pieces.length);
    const samples=lid.contacts.map(([lx,lz])=>heightAt(x+c*lx+s*lz,z-s*lx+c*lz,nearby));
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
  function pickCover(clientX,clientY,foreground){
    if(!lid?.group.visible)return null;
    setRay(clientX,clientY);
    const hits=[];
    for(const mesh of lid.group.children)intersectStrips(ray,mesh,hits);
    const hit=hits.find(h=>h.object===lid.group.children[1]||lid.mask.alpha(h.uv.x,1-h.uv.y)>=.49);
    if(!hit)return null;
    // The glass, a filling or the plate can be in front of the crust in a low shot.
    if(foreground===undefined)foreground=pick(clientX,clientY);
    if(foreground&&foreground.distance<hit.distance-.001)return null;
    if(behindPlate(hit.point.y,hit.distance))return null;
    const anchor=lid.group.worldToLocal(hit.point.clone());anchor.y-=lid.bend?.(anchor.x,anchor.z)||0;return anchor;
  }
  function nearbyTap(x,y){
    // Only called on a completed touch tap that missed. Each sample must hit
    // a visible surface through the same camera, including lid and plate occlusion.
    const rect=canvas.getBoundingClientRect();
    setRay(x,y);
    const centerRay=ray.ray.clone(),localRay=new THREE.Ray(),inverse=new THREE.Matrix4();
    const local=new THREE.Vector3(),at=new THREE.Vector3(),plane=new THREE.Plane(new THREE.Vector3(0,1,0));
    for(const radius of [3,6]){
      for(let direction=0;direction<8;direction++){
        const angle=direction*Math.PI/4,sx=x+radius*Math.cos(angle),sy=y+radius*Math.sin(angle);
        if(sx<rect.left||sx>=rect.right||sy<rect.top||sy>=rect.bottom)continue;
        const hit=pick(sx,sy),anchor=pickCover(sx,sy,hit);
        if(!hit&&!anchor)continue;
        const entry=hit?.i>=0?placed[hit.i]:null;
        const ref=anchor?lid:entry?.ref??bread;
        const node=anchor?lid.group:entry?nodes[entry.i]:bread.group;
        if(anchor){
          local.copy(anchor);
          if(lid.bend)local.y+=lid.bend(local.x,local.z);
        }else node.worldToLocal(local.set(hit.x,hit.y,hit.z));
        plane.constant=-local.y;
        localRay.copy(centerRay).applyMatrix4(inverse.copy(node.matrixWorld).invert());
        if(!localRay.intersectPlane(plane,at))continue;
        if(!anchor&&entry&&pantry[entry.piece.food].drink){
          if(Math.abs(at.x)<=ref.width/2&&Math.abs(at.z)<=ref.height/2)continue;
        }else if(!outsideFootprint(ref,at.x,at.z))continue;
        return anchor?'cover':hit.i;
      }
    }
    return null;
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
      settleCover(boundedCoverPose({x:pose.x+dx,z:pose.z+dz,yaw:pose.yaw}),.48,true);
    }
    if(breadId==='simit')applyCrownShape();
    render();
  }
  function drape(p,index,base,ref=modelFor(p),stiff=p.food===breads.simit.crown ? .32 : p.food==='kasar' ? .50 : p.food.includes('onion') ? .70 : .9){
    const c=Math.cos(p.a),s=Math.sin(p.a);
    const ring=!p.food||p.food===breads.simit.crown;
    const nearby=nearbySupports(p,ref,index);
    const steps=28,stride=steps+1,grid=new Float32Array(stride*stride);
    // A nearby high spot lifts a region of the slice through its own stiffness.
    // Propagate those contact heights, then relax the surface between contacts.
    for(let row=0;row<=steps;row++)for(let col=0;col<=steps;col++){
      const x=(col/steps-.5)*ref.width,z=(row/steps-.5)*ref.height;
      grid[row*stride+col]=ring&&ref.mask.alpha(col/steps,row/steps)<.45?clothHeight:heightAt(p.x+localX(p,x)*c+z*s,p.z-localX(p,x)*s+z*c,nearby);
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
  function conform(group,template,offset){
    if(!offset&&!group.userData.draped)return;
    for(let i=0;i<template.children.length;i++){
      const mesh=group.children[i],base=template.children[i].geometry;
      if(!offset){mesh.geometry.dispose();mesh.geometry=base;continue;}
      if(mesh.geometry===base)mesh.geometry=base.clone();
      const vertices=mesh.geometry.attributes.position,original=base.attributes.position;
      for(let j=0;j<vertices.count;j++)vertices.setY(j,original.getY(j)+offset(original.getX(j),original.getZ(j)));
      vertices.needsUpdate=true;mesh.geometry.boundingBox=null;
      if(i===0)mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
    group.userData.draped=!!offset;
  }
  function releaseNode(node){
    scene.remove(node);
    if(node.userData.draped)for(const mesh of node.children)mesh.geometry.dispose();
  }
  function sync(r,settle=false,fitView=true){
    selectionTargets=null;
    for(const [piece] of landing){
      const i=placed.findIndex(entry=>entry.piece===piece);
      if(i>=0){position(nodes[i],piece,heights[i]);invalidatePose(i);}
    }
    landing.clear();recipe=r;setCloth(r.cloth);activateBread(r.bread);
    bread.group.visible=!r.baseRemoved;
    const base=bread.group.visible?bread:null,marks=JSON.stringify(r.strokes);
    let keep=0;
    // Support depends only on the bread and the pieces below this one. Keep
    // that prefix, including its deformed meshes and their GPU buffers.
    if(supportBread===base&&breadMarks===marks){
      while(keep<placed.length&&keep<r.pieces.length){
        const entry=placed[keep],p=r.pieces[keep];
        if(entry.piece!==p||(settle&&!entry.stable)||entry.state!==JSON.stringify(p))break;
        keep++;
      }
    }
    supportBread=base;breadMarks=marks;
    const reusable=new Map();
    for(let i=keep;i<nodes.length;i++){
      const node=nodes[i],coating=node.children.at(-1);
      if(coating?.userData.coating)node.remove(coating);
      // Reinsert in recipe order to preserve transparent sorting. Keep GPU
      // buffers alive during a drag even when the supports underneath change.
      scene.remove(node);
      reusable.set(placed[i].piece,{node,template:placed[i].template});
    }
    const present=new Set(r.pieces);
    for(const [p,coat] of coatings)if(!present.has(p)){
      coat.dispose();coatings.delete(p);
    }
    paintLoaf(r.strokes);
    nodes.length=heights.length=offsets.length=placed.length=keep;
    for(let i=keep;i<r.pieces.length;i++){
      const p=r.pieces[i],ref=modelFor(p),{height,stable,offset}=support(p,i,-1,true);
      if(settle&&!stable){r.pieces.splice(i--,1);slip(p);continue;}
      const template=pieceTemplate(p,ref),cached=reusable.get(p);
      const g=cached?.template===template?cached.node:template.clone();
      if(g===cached?.node)reusable.delete(p);
      const shape=ref.flex?drape(p,i,height):offset;
      conform(g,template,shape);
      offsets.push(shape);
      heights.push(height);position(g,p,height);scene.add(g);nodes.push(g);paintPiece(p,i);
      const c=Math.cos(p.a),s=Math.sin(p.a);
      // Some drinks have handles beyond their nominal body. Their own mask
      // handles these samples. Image-backed food has a strict UV rectangle.
      const extentX=pantry[p.food].drink?Infinity:(Math.abs(c)*ref.width+Math.abs(s)*ref.height)/2;
      const extentZ=pantry[p.food].drink?Infinity:(Math.abs(s)*ref.width+Math.abs(c)*ref.height)/2;
      placed.push({piece:p,i,ref,template,c,s,extentX,extentZ,stable,state:JSON.stringify(p)});
    }
    for(const {node} of reusable.values())releaseNode(node);
    if(printOnly){renderer.shadowMap.needsUpdate=true;return;}
    placeCover();
    if(!view&&fitView){measureEditor();cameraPosition();}
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
      coat=createCoating(modelFor(p),art);coat.mesh.userData.coating=true;coatings.set(p,coat);
    }
    coat.update(p.marks||[],offsets[i]);
    if(coat.mesh.parent!==nodes[i])nodes[i].add(coat.mesh);
  }
  function paintBread(strokes){
    paintLoaf(strokes);recipe.pieces.forEach(paintPiece);
    selectionTargets=null;
    for(const entry of placed)if(coatings.has(entry.piece))entry.pickTarget=null;
    render();
  }
  function step(ms){
    clock+=ms;let moving=false;
    for(const [p,start] of landing){
      const i=recipe.pieces.indexOf(p),t=clamp((clock-start)/270,0,1);
      invalidatePose(i);
      if(i<0||t===1){if(i>=0)position(nodes[i],p,heights[i]);landing.delete(p);continue;}
      const lift=.105*(1-t*t)*Math.max(0,1-t*1.45)+.011*Math.abs(Math.sin(t*13))*Math.pow(1-t,2);
      nodes[i].position.y=heights[i]+lift;nodes[i].rotation.z=.068*Math.sin(t*Math.PI*2)*(1-t);moving=true;
    }
    for(let i=falls.length-1;i>=0;i--){
      const fall=falls[i],t=clamp((clock-fall.start)/430,0,1),g=fall.node;
      g.position.x=fall.x+fall.dx*t*.20;g.position.z=fall.z+fall.dz*t*.20;
      g.position.y=.13*(1-t*t);g.rotation.z=t*.93;g.scale.setScalar(1-.78*t*t);g.scale.x*=fall.sign;
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
    if(!p&&!ghost&&hover===null)return;
    if(hover!==null && nodes[hover])nodes[hover].visible=true;
    hover=hide<0?null:hide;if(hover!==null)nodes[hover].visible=false;
    const opening=p?openingPercent(p):0;
    const ref=p?modelFor(p):null;
    if(ghost&&(ghostModel!==ref||ghost.userData.opening!==opening)){scene.remove(ghost);ghost=null;}
    if(p){
      if(!ghost){ghost=pieceTemplate(p).clone();ghostModel=ref;ghost.userData.opening=opening;scene.add(ghost);}
      const coat=hide>=0&&coatings.get(recipe.pieces[hide]);
      if(ghost.children.at(-1)?.userData.coating && ghost.children.at(-1).geometry!==coat?.mesh.geometry)ghost.remove(ghost.children.at(-1));
      if(coat&&!ghost.children.at(-1)?.userData.coating)ghost.add(coat.mesh.clone());
      position(ghost,p,support(p,recipe.pieces.length,hide).height+.10);
      ghost.rotation.z=clamp(swing,-.21,.21)+.035*Math.sin(10*p.x+3*p.z);
    } render();
  }
  function slip(p){

    const g=pieceTemplate(p).clone();position(g,p,.1);scene.add(g);
    const length=Math.hypot(p.x,p.z)||1;
    falls.push({node:g,start:clock,sign:localX(p,1),x:p.x,z:p.z,dx:p.x/length,dz:p.z/length});run();
  }
  function capture(pixels=960){
    // Render the square gate at the actual export resolution, even on a phone.
    if(printOnly){
      if(canvas.width!==pixels||canvas.height!==pixels)renderer.setDrawingBufferSize(pixels,pixels,1);
      photoCamera.aspect=1;photoCamera.fov=THREE.MathUtils.radToDeg(2*Math.atan(photoSetup.tan));
      photoCamera.updateProjectionMatrix();
      photoFocus.render(scene,photoCamera,photoSetup,pixels);
      return canvas;
    }
    if(cameraFrame)render(undefined,false);
    const out=canvas2d(pixels,pixels),size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
    const fov=photoCamera.fov,aspect=photoCamera.aspect;
    try{
      renderer.setDrawingBufferSize(pixels,pixels,1);
      photoCamera.aspect=1;photoCamera.fov=THREE.MathUtils.radToDeg(2*Math.atan(photoSetup.tan));
      photoCamera.updateProjectionMatrix();photoFocus.exportFrame(scene,photoCamera,photoSetup,pixels);
      out.getContext('2d').drawImage(canvas,0,0);
    }finally{
      renderer.setDrawingBufferSize(size.x,size.y,ratio);
      photoCamera.fov=fov;photoCamera.aspect=aspect;photoCamera.updateProjectionMatrix();
      photoFocus.present(photoCamera,photoSetup,framePixels*ratio);
    }
    return out;
  }
  if(printOnly)editorAspect=canvas.clientWidth/canvas.clientHeight||1;
  else{
    resize(false);
    new ResizeObserver(()=>{
      if(canvas.clientWidth!==viewportWidth||canvas.clientHeight!==viewportHeight)resize();
    }).observe(canvas);
  }
  return {sync,xy,pick,nearbyTap,support,lift,slip,paintBread,step,capture,setView,rotate,refreshCover,
    coverPose,coverHandle,pickCover,covers,coverPlanePoint,dragCover,
    placeCut(piece,index){
      const ref=modelFor(piece);
      if(!support(piece,index).stable){
        const radius=Math.hypot(piece.x,piece.z),fit=(plateRadius-Math.hypot(ref.width,ref.height)/2)/radius;
        if(fit<1){piece.x=round(piece.x*fit);piece.z=round(piece.z*fit);}
      }
      for(const mark of piece.marks||[])for(const pt of mark.line){
        const u=pt[0]/1024,v=pt[1]/1024;
        if(ref.mask.alpha(u,v)>.5)continue;
        let best=Infinity;
        for(const [x,z] of ref.contacts){
          const cu=.5+x/ref.width,cv=.5+z/ref.height;
          const dist=(u-cu)**2+(v-cv)**2;
          if(dist<best){best=dist;pt[0]=Math.round(cu*1024);pt[1]=Math.round(cv*1024);}
        }
      }
    },
    drinkService(id){return foodModel(id).service();},
    adjustCover(pose){settleCover(boundedCoverPose(pose),.48);render();},
    restoreCover(){placeCover();render();},
    fitEditedCover(){measureEditor();cameraPosition();render(undefined,false);},
    changeCloth(id){setCloth(id);render();},
    frame(){return {target:photoSetup.target.toArray(),distance:photoSetup.distance,tan:photoSetup.tan,aspect:editorAspect};},
    pose(){return {...orbit};},hasEditPose(){return !!editPose;},
    resetOrbit(overhead=false){editPose=overhead?presetPose('top'):null;setView(view?'tilt':null);},
    drinkSpot(id){
      const radius=foodModel(id).width/2;
      for(const ring of [Math.hypot(.48,.32),.77,.95]){
        for(let i=0;i<16;i++){
          const angle=Math.atan2(.32,.48)+i*Math.PI/8,x=ring*Math.cos(angle),z=ring*Math.sin(angle);
          if(!covers(x,z)&&recipe.pieces.every(p=>Math.hypot(x-p.x,z-p.z)>radius+modelFor(p).width/2+.025))return {x,z};
        }
      }
      return null;
    },
    landingSpot(n){
      for(let k=0;k<32;k++){
        const angle=(n+k)*2.39996+.25,x=.29*Math.cos(angle),z=.27*Math.sin(angle);
        if((recipe.baseRemoved||hasBread(x,z))&&!covers(x,z))return {x,z};
      }
      return null;
    },
    servingSpot(n){
      if(!recipe.baseRemoved){
        const spot=this.landingSpot(n);
        return spot&&{i:-1,u:spot.x/bread.width+.5,v:spot.z/bread.height+.5,...spot};
      }
      const b=canvas.getBoundingClientRect();
      for(let i=0;i<recipe.pieces.length;i++){
        const index=(n+i)%recipe.pieces.length,p=recipe.pieces[index],ref=modelFor(p);
        if(pantry[p.food].drink)continue;
        const [lx,lz]=ref.contacts[Math.floor(ref.contacts.length/2)]||[0,0];
        const c=Math.cos(p.a),s=Math.sin(p.a),x=p.x+localX(p,lx)*c+lz*s,z=p.z-localX(p,lx)*s+lz*c;
        const pos=screen(x,heightAt(x,z),z);
        if(!pickCover(b.left+pos.x,b.top+pos.y)){
          const hit=pick(b.left+pos.x,b.top+pos.y,false);
          if(hit&&!pantry[recipe.pieces[hit.i]?.food]?.drink)return hit;
        }
      }
      return null;
    },
    land(p){landing.set(p,clock);run();},

    handle(i){
      const p=recipe.pieces[i];if(!p)return null;
      const ref=modelFor(p),edge=ref.width*.5,height=heights[i]+ref.depth+(offsets[i]?.(localX(p,edge),0)||0);
      const at=screen(p.x+Math.cos(p.a)*edge,height,p.z-Math.sin(p.a)*edge);
      if(pantry[p.food].bread||pantry[p.food].drink){at.x=clamp(at.x,23,canvas.clientWidth-23);at.y=clamp(at.y,23,canvas.clientHeight-23);}
      return {...at,height};
    }
  };
}
