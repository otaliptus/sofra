export const breads = {
  simit: {name:'Simit', asset:'split-simit', depth:.057, crown:'simit-kapak', crownDepth:.078},
  pogaca: {name:'Poğaça', asset:'pogaca', depth:.074, crown:'pogaca-kapak', crownDepth:.132},
  acma: {name:'Açma', asset:'acma', depth:.066, crown:'acma-kapak', crownDepth:.104},
  'tas-ekmek': {name:'Taş ekmek sandviç', asset:'tas-ekmek', depth:.062, crown:'tas-kapak', crownDepth:.085, closable:true}
};
export const photoCovers={open:'Açık',half:'Yarı kapalı',full:'Kapalı',side:'Yanında',custom:'Serbest'};
export const photoCoverFor=recipe=>recipe.photoCover??(recipe.closed?'full':'open');
export const ingredients = [
  {id:'cream',name:'Bal kaymak',en:'Honey and clotted cream',asset:'kaymak',kind:'spread'},
  {id:'jam',name:'Vişne reçeli',en:'Sour cherry jam',asset:'recel',kind:'spread'},
  {id:'menemen',name:'Menemen',en:'Tomato and eggs',kind:'spread'},
  ...[
    ['white-cheese','Beyaz peynir','White cheese',.37,.027],
    ['kasar','Kaşar peyniri','Kaşar cheese',.39,.014],
    ['tomato','Domates','Tomato slice',.46,.022],
    ['cucumber','Salatalık','Cucumber slice',.32,.022],
    ['sausage','Sucuk','Sucuk coin',.30,.028],
    ['black-ring','Dilim siyah zeytin','Pitted black olive slice',.125,.014],
    ['green-ring','Dilim yeşil zeytin','Pitted green olive slice',.13,.014],
    ['onion','Soğan','White onion ring',.305,.015],
    ['red-onion','Kırmızı soğan','Red onion ring',.32,.014],
    ['black-olive','Siyah zeytin','Black olive',.145,.059],
    ['green-olive','Yeşil zeytin','Green olive',.15,.040],
    ['egg-slice','Yumurta','Boiled egg slice',.31,.035],
    ['pepper','Sivri biber','Green pepper',.41,.027],
    ['fried-egg','Sahanda yumurta','Fried egg',.55,.066],
    ['parsley','Maydanoz','Parsley',.24,.006],
    ['pastirma','Pastırma','Cured beef',.44,.013],
    ['cay','Çay','Tea glass and saucer',.34,.018]
  ].map(([id,name,en,size,depth])=>({id,name,en,size,depth,kind:'topping'})),
  ...[
    ['pul-biber','Pul biber','spice'],['karabiber','Karabiber','spice'],
    ['kekik','Kekik','spice'],['nane','Nane','spice'],
    ['ketcap','Ketçap','sauce'],['mayonez','Mayonez','sauce']
  ].map(([id,name,kind])=>({id,name,kind}))
];
export const pantry=Object.fromEntries(ingredients.map(d=>[d.id,d]));
export const cloths={
  kareli:{name:'Kareli',asset:'kareli-bezi',width:1},
  tokat:{name:'Tokat',asset:'tokat-bezi',width:.85}
};
export const emptyRecipe=(bread='simit',cloth='kareli')=>({v:2,bread,cloth,closed:false,strokes:[],pieces:[]});
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const round=x=>Math.round(x*1000)/1000;
export function boundedCoverPose(pose){
  if(!pose||![pose.x,pose.z,pose.yaw].every(Number.isFinite))return null;
  return {x:round(clamp(pose.x,-1.6,1.6)),z:round(clamp(pose.z,-1.6,1.6)),yaw:round(pose.yaw%(2*Math.PI))};
}
export const isTool=id=>['spread','sauce','spice'].includes(pantry[id]?.kind);
export function readRecipe(r) {
  if(r?.v!==2||!Object.hasOwn(breads,r.bread??'simit')||!Array.isArray(r.strokes)||!Array.isArray(r.pieces)||r.pieces.length>80)return null;
  const validNumber=n=>Number.isFinite(n)&&Math.abs(n)<=20;
  let strokeCount=0;
  function validMarks(marks){
    if(!Array.isArray(marks)||(strokeCount+=marks.length)>200)return false;
    return marks.every(mark=>mark&&isTool(mark.food)&&Array.isArray(mark.line)&&mark.line.length>=1&&mark.line.length<=160&&
      mark.line.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=1024)));
  }
  if(!validMarks(r.strokes)||r.pieces.some(p=>!p||pantry[p.food]?.kind!=='topping'||![p.x,p.z,p.a].every(validNumber)||!validMarks(p.marks??[])))return null;
  const marks=list=>list.map(({food,line,load})=>({food,line,...(Number.isFinite(load)?{load:clamp(load,.12,1)}:{})}));
  // Recipes saved before cloth selection were photographed on the Tokat print.
  const cloth=Object.hasOwn(cloths,r.cloth)?r.cloth:'tokat';
  const photoCoverPose=boundedCoverPose(r.photoCoverPose);
  const validCover=typeof r.photoCover==='string'&&Object.hasOwn(photoCovers,r.photoCover)&&(r.photoCover!=='custom'||photoCoverPose);
  return {...emptyRecipe(r.bread,cloth),closed:r.bread==='tas-ekmek'&&r.closed===true,
    ...(photoCoverPose?{photoCoverPose}:{}),...(validCover?{photoCover:r.photoCover}:{}),strokes:marks(r.strokes),pieces:r.pieces.map(p=>{
    const dem=clamp(Math.floor(Number(p.dem)||0),0,10);
    return {food:p.food,x:round(clamp(p.x,-1.3,1.3)),z:round(clamp(p.z,-.8,.8)),a:round(p.a%(Math.PI*2)),dem,
      water:clamp(Math.floor(Number(p.water)||0),0,10-dem),...(p.marks?.length?{marks:marks(p.marks)}:{})};
  })};
}
export function recipeFromHash(hash) {
  try {if(!hash.startsWith('#simit=')||hash.length>750000)return null;return readRecipe(JSON.parse(atob(hash.slice(7))));}catch{return null;}
}
export function recipeURL(recipe) {
  const url=new URL(location.href);url.hash='simit='+btoa(JSON.stringify(recipe));return url.href;
}
export function photoStore() {
  const opened=new Promise((resolve,reject)=>{
    const request=indexedDB.open('sofra-simit-album',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return async (action,record)=>{
    const db=await opened;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('photos',action==='keep'?'readwrite':'readonly'),store=tx.objectStore('photos');
      const request=action==='keep'?store.add(record):store.getAll();
      tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  };
}
