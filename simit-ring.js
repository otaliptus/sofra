import * as THREE from './node_modules/three/build/three.module.js';

// Trace both edges of each sesame twist once. The crumb, crust and underside
// reuse those rings, so an oblique camera cannot look through their join.
export function simitRing(mask,width,height,depth,crown){
  const steps=256,tau=2*Math.PI,edges=[];
  for(let i=0;i<steps;i++){
    const a=i*tau/steps,c=Math.cos(a),s=Math.sin(a);
    let inner=1,outer=0;
    for(let j=40;j<326;j++){
      const r=j/600;
      if(mask.alpha(.5+r*c,.5+r*s*width/height)<.78)continue;
      inner=Math.min(inner,r);outer=r;
    }
    edges.push([inner+.0015,outer-.0015]);
  }
  function boundaries(angle){
    const idx=(angle/tau+1)*steps,lo=Math.floor(idx),f=idx-lo;
    const a=edges[lo%steps],b=edges[(lo+1)%steps];
    return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];
  }
  function peak(f,a){
    if(!crown)return depth;
    const round=Math.pow(Math.max(0,Math.sin(Math.PI*f)),.66);
    return depth*(.15+round*(.78+.07*Math.sin(5*a+f*3.1)));
  }
  function topY(u,v){
    if(!crown)return depth;
    const x=u-.5,z=(v-.5)*height/width,angle=Math.atan2(z,x),[lo,hi]=boundaries(angle);
    const f=THREE.MathUtils.clamp((Math.hypot(x,z)-lo)/(hi-lo),0,1);
    return peak(f,angle);
  }
  function surface(rows,point,reverse=false){
    const positions=[],uv=[],indices=[];
    for(let i=0;i<=steps;i++){
      const angle=i*tau/steps,[lo,hi]=edges[i%steps];
      for(let j=0;j<=rows;j++){
        const [r,y,sideUV]=point(j/rows,lo,hi,angle);
        const x=r*width*Math.cos(angle),z=r*width*Math.sin(angle);
        positions.push(x,y,z);
        uv.push(...(sideUV?[i/steps,sideUV[0]]:[.5+x/width,.5-z/height]));
        if(i===steps||j===rows)continue;
        const a=i*(rows+1)+j,b=a+rows+1;
        if(reverse)indices.push(a,a+1,b,a+1,b+1,b);
        else indices.push(a,b,a+1,a+1,b,b+1);
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    const n=g.attributes.normal;
    for(let j=0;j<=rows;j++){
      const k=steps*(rows+1)+j;
      const v=new THREE.Vector3(n.getX(j)+n.getX(k),n.getY(j)+n.getY(k),n.getZ(j)+n.getZ(k)).normalize();
      n.setXYZ(j,v.x,v.y,v.z);n.setXYZ(k,v.x,v.y,v.z);
    }
    return g;
  }
  // Both walls round under the cut edge. Use a single indexed draw for the
  // two disconnected strips; no face spans the centre hole.
  const inset=crown?.0009:.009;
  function wall(inner){
    return surface(5,(f,lo,hi)=>{
      const dir=inner?1:-1,r=inner?lo:hi;
      const lip=-.0025*Math.sin(Math.PI*f);
      return [r+dir*(inset*f*f+lip),peak(inner?0:1,0)*(1-f),[1-f]];
    },inner);
  }
  const outer=wall(false),inner=wall(true);
  for(const key of ['position','normal','uv']){
    const a=outer.attributes[key],b=inner.attributes[key];
    outer.setAttribute(key,new THREE.Float32BufferAttribute([...a.array,...b.array],a.itemSize));
  }
  const offset=inner.attributes.position.count;
  outer.setIndex([...outer.index.array,...inner.index.array.map(i=>i+offset)]);
  inner.dispose();
  return {top:surface(crown?24:2,(f,lo,hi,a)=>[lo+(hi-lo)*f,peak(f,a)]),sides:outer,
    bottom:surface(crown?14:2,(f,lo,hi)=>[lo+inset+(hi-lo-inset*2)*f,0],true),topY};
}
