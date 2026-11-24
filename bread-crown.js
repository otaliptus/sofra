// Approximate distance from the cutout edge, including the inside of each
// ring. The crown rounds into both edges as it would on a sliced simit.
export function crownHeight(mask,depth){
  const {w,h}=mask,dist=new Float32Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    if(mask.alpha((x+.5)/w,(y+.5)/h)>.5)dist[y*w+x]=w+h;
  }
  for(const step of [1,-1]){
    for(let y=step>0?1:h-2;y>0&&y<h-1;y+=step){
      for(let x=step>0?1:w-2;x>0&&x<w-1;x+=step){
        const i=y*w+x,prev=i-step*w;
        dist[i]=Math.min(dist[i],dist[i-step]+1,dist[prev]+1,
          dist[prev-step]+Math.SQRT2,dist[prev+step]+Math.SQRT2);
      }
    }
  }
  const max=Math.max(1,...dist);
  return (u,v)=>{
    const x=Math.max(0,Math.min(w-1,Math.floor(u*w))),y=Math.max(0,Math.min(h-1,Math.floor(v*h)));
    const t=dist[y*w+x]/max;
    return depth*(.14+.86*Math.sqrt(t*(2-t)));
  };
}

// Leave a little cloth between the nearest crust and the rim. Every filling
// can move independently without causing the parked bread to change sides.
export function parkedCrown(crown,plateRadius,aspect){
  // Put the spare toward the longer edge of the table in the opening overhead view.
  const angle=Math.atan2(-1,-aspect*aspect),dx=Math.cos(angle),dz=Math.sin(angle),yaw=-.23;
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const inside=Math.min(...crown.perimeter.map(([x,z])=>(c*x+s*z)*dx+(c*z-s*x)*dz));
  const distance=plateRadius+.055-inside;
  return {x:distance*dx,z:distance*dz,yaw};
}

// Tuck the top diagonally for the half-covered photo, favouring visible food.
export function crownPlacement(mode,bread,crown,pieces,foods){
  if(mode==='full')return {x:0,z:0,yaw:0};
  let best,lowest=Infinity;
  for(let i=0;i<12;i++){
    const a=-2.22+i*Math.PI/6,dx=Math.cos(a),dz=Math.sin(a);
    const edges=bread.perimeter.map(([x,z])=>x*dx+z*dz);
    const span=Math.max(...edges)-Math.min(...edges);
    const distance=.35*span;
    const x=distance*dx,z=distance*dz,yaw=(dx<0 ? -.12 : .12);
    const c=Math.cos(yaw),s=Math.sin(yaw);
    let score=.09*(1-Math.cos(i*Math.PI/6));
    for(const p of pieces){
      const food=foods[p.food],pc=Math.cos(p.a),ps=Math.sin(p.a);
      let covered=0,sampled=0;
      const stride=Math.max(1,Math.floor(food.contacts.length/12));
      for(let j=0;j<food.contacts.length;j+=stride){
        const [lx,lz]=food.contacts[j],px=p.x+pc*lx+ps*lz-x,pz=p.z-ps*lx+pc*lz-z;
        if(crown.mask.alpha((px*c-pz*s)/crown.width+.5,(px*s+pz*c)/crown.height+.5)>.5)covered++;
        sampled++;
      }
      score+=(p.food==='cay'?12:food.width*food.height)*covered/sampled;
    }
    if(score<lowest){best={x,z,yaw};lowest=score;}
  }
  return best;
}
