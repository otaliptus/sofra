import {pantry, tableCoverFor} from './recipe.js';

export const breadStackLimit = 10;
export const breadStackMessage = `Bir yığında en fazla ${breadStackLimit} ekmek parçası olabilir.`;

// Outer crusts measured in the same units as the recipe. Convex footprints
// avoid treating the transparent corners around a rotated loaf as bread.
const outlines = {
  simit: [[.49,-.01],[.44,.20],[.32,.35],[.17,.45],[-.03,.49],[-.20,.45],[-.35,.35],[-.45,.21],[-.48,-.09],[-.30,-.37],[0,-.49],[.35,-.30]],
  acma: [[.49,.06],[.47,.17],[.40,.28],[.20,.41],[-.11,.46],[-.36,.32],[-.49,-.06],[-.32,-.36],[-.15,-.45],[-.07,-.46],[.29,-.38],[.37,-.30]],
  pogaca: [[.49,0],[.48,.08],[.35,.28],[.29,.31],[-.11,.37],[-.31,.31],[-.45,.17],[-.49,-.04],[-.40,-.22],[-.24,-.35],[.06,-.37],[.30,-.32],[.48,-.06]],
  'tas-ekmek': [[.49,0],[.45,.06],[.25,.17],[-.04,.20],[-.29,.16],[-.49,.03],[-.49,0],[-.25,-.16],[-.03,-.20],[.24,-.16],[.46,-.03]]
};

function footprint(bread,x,z,yaw){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return outlines[bread].map(([u,v])=>[x+c*u+s*v,z-s*u+c*v]);
}

function separated(a,b){
  return a.some(([x,z],i)=>{
    const [nextX,nextZ]=a[(i+1)%a.length];
    return b.every(([u,v])=>(nextX-x)*(v-z)-(nextZ-z)*(u-x)<=0);
  });
}

// Follow overlapping breads in placement order. A loaf bridging two piles
// adds one layer above the taller pile; a filling never resets the count.
export function exceedsBreadStack(recipe,top){
  if(recipe.pieces.length+2<=breadStackLimit)return false;
  const layers=[];
  if(!recipe.baseRemoved)layers.push({bread:recipe.bread,x:0,z:0,a:0});
  for(const piece of recipe.pieces){
    const bread=pantry[piece.food].bread;
    if(bread)layers.push({bread,x:piece.x,z:piece.z,a:piece.a});
  }
  if(top===undefined){
    const mode=tableCoverFor(recipe);
    if(mode==='full')top={x:0,z:0,yaw:0};
    else if(mode==='custom')top=recipe.coverPose;
  }
  if(top&&!recipe.coverRemoved)layers.push({bread:recipe.bread,x:top.x,z:top.z,a:top.yaw});
  if(layers.length<=breadStackLimit)return false;
  for(let i=0;i<layers.length;i++){
    const layer=layers[i];
    layer.shape=footprint(layer.bread,layer.x,layer.z,layer.a);
    layer.depth=1;
    for(let j=i-1;j>=0;j--){
      const lower=layers[j];
      if(lower.depth<layer.depth||Math.abs(layer.x-lower.x)>1.05||Math.abs(layer.z-lower.z)>1.05)continue;
      if(!separated(layer.shape,lower.shape)&&!separated(lower.shape,layer.shape)){
        layer.depth=lower.depth+1;
        if(layer.depth>breadStackLimit)return true;
      }
    }
  }
  return false;
}
