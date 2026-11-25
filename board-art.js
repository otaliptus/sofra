import {assetURL} from './asset-url.js';
import {breads,cloths,pantry,wholeCuts} from './recipe.js';

export const art=Object.create(null);
const loading=new Map();
const breadArt=id=>[breads[id].asset,breads[id].crown,id==='simit'?'sesame-crust':id+'-crust'];
export const clothArt=id=>id==='gazete'?['kareli-bezi',cloths.gazete.asset]:[cloths[id].asset];

export function foodArt(id){
  const food=pantry[id];
  if(food.bread)return breadArt(food.bread);
  if(id==='cay')return ['cay','tea-saucer'];
  if(food.drink)return [id.endsWith('-sut')?'milk-art':'drink-art'];
  if(food.paste)return ['smear-'+id];
  if(id==='cream'||id==='jam')return ['servings','serving-relief','smear-'+id];
  if(id==='menemen')return ['servings','serving-relief'];
  if(wholeCuts[id])return [food.asset||id,pantry[wholeCuts[id].ring].asset||wholeCuts[id].ring];
  return food.kind==='topping'?[food.asset||id]:[];
}
export function recipeArt(recipe){
  const ids=new Set(['kahvalti-tabagi',...clothArt(recipe.cloth),...breadArt(recipe.bread)]);
  function include(id){for(const asset of foodArt(id))ids.add(asset);}
  for(const p of recipe.pieces){include(p.food);for(const m of p.marks||[])include(m.food);}
  for(const m of recipe.strokes)include(m.food);
  return ids;
}
export async function decodeImage(id,urlFor=assetURL){
  const image=new Image();image.src=urlFor(id);
  await image.decode();return image;
}
// A warm operation stays synchronous, including repeated shelf clicks and undo.
export function prepareArt(ids,loadImage=decodeImage){
  const jobs=[];
  for(const id of new Set(ids)){
    if(art[id])continue;
    if(!loading.has(id)){
      loading.set(id,loadImage(id).then(image=>{art[id]=image;}).finally(()=>loading.delete(id)));
    }
    jobs.push(loading.get(id));
  }
  return jobs.length?Promise.all(jobs):null;
}
