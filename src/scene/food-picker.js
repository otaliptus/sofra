import * as THREE from '../../node_modules/three/build/three.module.js';

// Food walls and gridded surfaces are ordered spatially. Test short runs of triangles
// with Three's normal raycast, using a CPU-only view of the original buffers.
// Slicing creates a new geometry; draping and crown bending change only Y.
const stripsByGeometry=new WeakMap();
const stripSize=96; // 32 indexed triangles
let probe;
const localRay=new THREE.Ray(),inverse=new THREE.Matrix4(),vertex=new THREE.Vector3();
export function intersectStrips(ray,mesh,hits){
  const geo=mesh.geometry,positions=geo.attributes.position,index=geo.index;
  if(!geo.boundingBox)geo.computeBoundingBox();
  localRay.copy(ray.ray).applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
  if(!localRay.intersectsBox(geo.boundingBox))return;
  let strips=stripsByGeometry.get(geo);
  if(!strips){
    strips=[];
    for(let start=0;start<index.count;start+=stripSize){
      const bounds=new THREE.Box3(),end=Math.min(start+stripSize,index.count);
      for(let i=start;i<end;i++)bounds.expandByPoint(vertex.fromBufferAttribute(positions,index.getX(i)));
      strips.push(bounds);
    }
    stripsByGeometry.set(geo,strips);
  }
  if(!geo.boundingSphere)geo.computeBoundingSphere();
  probe??=new THREE.Mesh();
  const stripView=probe.geometry,first=hits.length;
  stripView.index=index;stripView.attributes=geo.attributes;
  stripView.boundingBox=geo.boundingBox;stripView.boundingSphere=geo.boundingSphere;
  probe.matrixWorld.copy(mesh.matrixWorld);probe.material=mesh.material;
  for(let i=0;i<strips.length;i++){
    const bounds=strips[i];
    bounds.min.y=geo.boundingBox.min.y;bounds.max.y=geo.boundingBox.max.y;
    if(!localRay.intersectsBox(bounds))continue;
    stripView.setDrawRange(i*stripSize,stripSize);
    probe.raycast(ray,hits);
  }
  for(let i=first;i<hits.length;i++)hits[i].object=mesh;
  if(hits.length>1)hits.sort((a,b)=>a.distance-b.distance);
}

// Cache the exact selectable meshes separately from their world-space bounds.
export function pickTarget(node,ref,index,food,drink,coating){
  const faces=[];
  if(food==='cay')faces.push(node.getObjectByName('saucer'),node.getObjectByName('glass'));
  else if(drink)node.traverseVisible(part=>{if(part.isMesh)faces.push(part);});
  else faces.push(node.children[0]);
  const surfaces=coating?.mesh.visible?[...faces,coating.mesh]:faces;
  return {node,ref,index,drink,coating,faces,surfaces,edge:drink?null:node.children[1],
    bounds:new THREE.Box3(),dirty:true,near:0};
}

export function createFoodPicker(){
  const candidates=[],hits=[],box=new THREE.Box3(),point=new THREE.Vector3();
  function include(bounds,mesh){
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    bounds.union(box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
  }
  return function nearest(ray,targets,grab){
    candidates.length=0;
    for(const target of targets){
      if(!target.node.visible)continue;
      if(target.dirty){
        target.bounds.makeEmpty();
        for(const face of target.surfaces)include(target.bounds,face);
        if(target.edge)include(target.bounds,target.edge);
        target.dirty=false;
      }
      if(!ray.ray.intersectBox(target.bounds,point))continue;
      target.near=target.bounds.containsPoint(ray.ray.origin)?0:ray.ray.origin.distanceTo(point);
      candidates.push(target);
    }
    candidates.sort((a,b)=>a.near-b.near);
    let best=null;
    for(const target of candidates){
      if(best&&target.near>best.distance+1e-8)break;
      hits.length=0;
      // Image-backed food uses indexed grids. Narrow the search before testing
      // dense rings and relief, including a ray passing through a simit hole.
      if(target.drink)ray.intersectObjects(target.faces,false,hits);
      else{
        for(const face of grab?target.surfaces:target.faces){
          if(face.geometry.index.count>384)intersectStrips(ray,face,hits);
          else face.raycast(ray,hits);
        }
        if(hits.length>1)hits.sort((a,b)=>a.distance-b.distance);
      }
      let nearest=null;
      for(const hit of hits){
        const u=hit.uv.x,v=1-hit.uv.y;
        if(hit.object===target.coating?.mesh&&target.coating.rise(u,v)<.0005)continue;
        if(!target.drink&&target.ref.mask.alpha(u,v)<.49)continue;
        nearest=hit;break;
      }
      // A valid face at the front of the box already wins over every side triangle.
      if(grab&&target.edge&&(!nearest||nearest.distance>target.near+1e-10)){
        hits.length=0;
        intersectStrips(ray,target.edge,hits);
        if(hits.length&&(!nearest||hits[0].distance<nearest.distance))nearest=hits[0];
      }
      if(nearest&&(!best||nearest.distance<best.distance||(nearest.distance===best.distance&&target.index<best.i))){
        const {point,uv,distance}=nearest;
        best={i:target.index,u:uv.x,v:1-uv.y,x:point.x,y:point.y,z:point.z,distance};
      }
    }
    return best;
  };
}

// Use the outer contour at the sampled height. A tap in a hole or concavity
// stays precise even when a neighbouring sample lands on its inner wall.
export function outsideFootprint(ref,x,z){
  for(let i=0;i<ref.perimeter.length;i++){
    const [ax,az]=ref.perimeter[i],[bx,bz]=ref.perimeter[(i+1)%ref.perimeter.length];
    if((bx-ax)*(z-az)-(bz-az)*(x-ax)<-1e-8)return true;
  }
  return false;
}
