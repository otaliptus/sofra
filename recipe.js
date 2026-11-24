export const breads = {
  simit: {name:'Simit', asset:'split-simit', depth:.057, crown:'simit-kapak', crownDepth:.078},
  pogaca: {name:'Poğaça', asset:'pogaca', depth:.074, crown:'pogaca-kapak', crownDepth:.132},
  acma: {name:'Açma', asset:'acma', depth:.066, crown:'acma-kapak', crownDepth:.104},
  'tas-ekmek': {name:'Taş ekmek sandviç', asset:'tas-ekmek', depth:.062, crown:'tas-kapak', crownDepth:.085, closable:true}
};
export const photoCovers={open:'Açık',half:'Yarı kapalı',full:'Kapalı',side:'Yanında',custom:'Serbest'};
export const tableCoverFor=recipe=>recipe.coverRemoved?'open':recipe.closed?'full':recipe.coverPose?'custom':'side';
export const photoCoverFor=recipe=>recipe.coverRemoved?'open':recipe.photoCover??tableCoverFor(recipe);
export const ingredients = [
  {id:'cream',name:'Bal kaymak',en:'Honey and clotted cream',asset:'kaymak',kind:'spread'},
  {id:'jam',name:'Vişne reçeli',en:'Sour cherry jam',asset:'recel',kind:'spread'},
  {id:'menemen',name:'Menemen',en:'Tomato and eggs',kind:'spread'},
  {id:'domates-salcasi',name:'Domates salçası',en:'Tomato paste',kind:'spread',paste:true},
  {id:'biber-salcasi',name:'Biber salçası',en:'Red pepper paste',kind:'spread',paste:true},
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
    ['pepper','Sivri biber','Green pepper',.41,.027],['pepper-ring','Biber halkası','Pepper ring',.112,.026],
    ['fried-egg','Sahanda yumurta','Fried egg',.55,.066],
    ['parsley','Maydanoz','Parsley',.24,.006],
    ['pastirma','Pastırma','Cured beef',.44,.013],
    ['avokado','Avokado dilimi','Avocado slice',.37,.042],
    ['yogurt','Süzme yoğurt','Strained yoghurt',.34,.061],
    ['muz','Muz dilimi','Banana slice',.19,.031],
    ['cikolata','Bitter çikolata','Dark chocolate chunk',.18,.034],
    ['cilek','Çilek dilimi','Strawberry slice',.23,.028]
  ].map(([id,name,en,size,depth])=>({id,name,en,size,depth,kind:'topping'})),
  ...[
    ['cay','Çay'],['ayran','Kapalı ayran','lid'],
    ['portakal-suyu','Portakal suyu','straw'],['visne-suyu','Vişne suyu','straw'],['kayisi-suyu','Kayısı suyu','straw'],
    ['cilekli-sut','Çilekli süt','straw'],['cikolatali-sut','Çikolatalı süt','straw'],['muzlu-sut','Muzlu süt','straw'],
    ['kahve','Filtre kahve'],['turk-kahvesi','Türk kahvesi']
  ].map(([id,name,opening])=>({id,name,kind:'topping',drink:true,opening})),
  ...[
    ['pul-biber','Pul biber','spice'],['karabiber','Karabiber','spice'],
    ['chia','Chia tohumu','spice'],['kekik','Kekik','spice'],['nane','Nane','spice'],
    ['ketcap','Ketçap','sauce'],['mayonez','Mayonez','sauce']
  ].map(([id,name,kind])=>({id,name,kind})),
  ...Object.entries(breads).map(([bread,spec])=>({
    id:spec.crown,kind:'topping',bread,name:(bread==='tas-ekmek'?'Taş ekmek':spec.name)+' üst yarısı'
  }))
];
export const pantry=Object.fromEntries(ingredients.map(d=>[d.id,d]));
export const cloths={
  kareli:{name:'Kareli',asset:'kareli-bezi',width:1},
  tokat:{name:'Tokat',asset:'tokat-bezi',width:.85},
  gazete:{name:'Gazete',asset:'gazete-kagidi',width:3.56}
};
export const emptyRecipe=(bread='simit',cloth='kareli')=>({v:2,bread,cloth,closed:false,strokes:[],pieces:[]});
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const round=x=>Math.round(x*1000)/1000;
export const sliceThickness={thin:{name:'İnce',scale:.5},regular:{name:'Orta',scale:1},thick:{name:'Kalın',scale:1.7}};
export const wholeCuts={
  pepper:{ring:'pepper-ring',thin:8,regular:5,thick:3},
  'black-olive':{ring:'black-ring',thin:4,regular:3,thick:2},
  'green-olive':{ring:'green-ring',thin:4,regular:3,thick:2}
};
// Distance is in table units, where a whole bread is one unit wide.
export const pasteRemaining=(food,distance)=>Math.exp(-distance/(food==='biber-salcasi'?.33:.395));
const slices=new Set(['pepper-ring','black-ring','green-ring','tomato','cucumber','sausage','onion','red-onion','egg-slice','avokado','muz','cilek','kasar','white-cheese','pastirma']);
export const canSlice=food=>Object.hasOwn(wholeCuts,food)||slices.has(food);
export const canMirror=food=>food==='pepper'||food==='pepper-ring';
export const localX=(piece,x)=>piece.mirrored?-x:x;
export function cutServings(piece,thickness){
  if(!canSlice(piece.food)||!Object.hasOwn(sliceThickness,thickness))return [];
  const portion={...piece};delete portion.thickness;
  if(thickness!=='regular')portion.thickness=thickness;
  const cut=wholeCuts[piece.food];
  if(!cut)return [portion];
  const count=cut[thickness],pepper=piece.food==='pepper',size=pantry[piece.food].size;
  const cs=Math.cos(piece.a),sn=Math.sin(piece.a);
  const rings=Array.from({length:count},(_,i)=>{
    const t=(i+.5)/count,bow=Math.sin(Math.PI*t);
    const x=localX(piece,size*((t-.5)*(pepper?1.04:1.45)+(pepper ? .15*bow : 0)));
    const z=size*(pepper?(.5-t)*.96+.12*bow:.12*bow);
    const ring={...portion,food:cut.ring,x:round(clamp(piece.x+x*cs+z*sn,-1.3,1.3)),z:round(clamp(piece.z-x*sn+z*cs,-.8,.8)),
      a:round((piece.a+localX(piece,(i-count/2)*.37))%(Math.PI*2))};
    delete ring.marks;
    if(pepper&&t<.28)ring.taper=true;
    return ring;
  });
  // Keep a seasoning stroke with its nearest cut without multiplying its portion.
  for(const mark of piece.marks||[]){
    const t=mark.line.reduce((sum,[u,v])=>sum+(pepper?(u+1024-v)/2048:u/1024),0)/mark.line.length;
    const ring=rings[clamp(Math.floor(t*count),0,count-1)];
    (ring.marks||=[]).push({...mark,line:mark.line.map(p=>[...p])});
  }
  return rings;
}
export function openingPercent(piece){
  const opening=pantry[piece.food]?.opening;
  if(opening==='lid'){
    if(Number.isFinite(piece.peel))return clamp(Math.round(piece.peel),0,100);
    // Older breakfasts stored the single halfway pose as a boolean.
    return piece.prepared===true?50:0;
  }
  return opening==='straw'&&piece.prepared===true?100:0;
}
export function boundedCoverPose(pose){
  if(!pose||![pose.x,pose.z,pose.yaw].every(Number.isFinite))return null;
  return {x:round(clamp(pose.x,-1.6,1.6)),z:round(clamp(pose.z,-1.6,1.6)),yaw:round(pose.yaw%(2*Math.PI))};
}
export const isTool=id=>['spread','sauce','spice'].includes(pantry[id]?.kind);
export function readRecipe(r) {
  const bread=r?.bread===undefined?'simit':r.bread;
  if(r?.v!==2||typeof bread!=='string'||!Object.hasOwn(breads,bread)||!Array.isArray(r.strokes)||!Array.isArray(r.pieces)||r.pieces.length>80)return null;
  const validNumber=n=>Number.isFinite(n)&&Math.abs(n)<=20;
  let strokeCount=0;
  function validMarks(marks){
    if(!Array.isArray(marks)||(strokeCount+=marks.length)>200)return false;
    return marks.every(mark=>mark&&typeof mark.food==='string'&&isTool(mark.food)&&Array.isArray(mark.line)&&mark.line.length>=1&&mark.line.length<=160&&
      mark.line.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=1024)));
  }
  if(!validMarks(r.strokes)||r.pieces.some(p=>!p||typeof p.food!=='string'||pantry[p.food]?.kind!=='topping'||![p.x,p.z,p.a].every(validNumber)||!validMarks(p.marks??[])))return null;
  const marks=list=>list.map(({food,line,load,portion})=>({food,line,...(Number.isFinite(portion)?{portion:clamp(portion,1,2.6)}:{}),...(Number.isFinite(load)?{load:clamp(load,.12,1)}:{})}));
  // Recipes saved before cloth selection were photographed on the Tokat print.
  const cloth=typeof r.cloth==='string'&&Object.hasOwn(cloths,r.cloth)?r.cloth:'tokat';
  const coverPose=boundedCoverPose(r.coverPose),photoCoverPose=boundedCoverPose(r.photoCoverPose);
  const validCover=typeof r.photoCover==='string'&&Object.hasOwn(photoCovers,r.photoCover)&&(r.photoCover!=='custom'||photoCoverPose||coverPose);
  const cover=r.coverRemoved===true?{coverRemoved:true}:{
    closed:r.baseRemoved!==true&&r.bread==='tas-ekmek'&&r.closed===true,
    ...(coverPose?{coverPose}:{}),...(photoCoverPose?{photoCoverPose}:{}),...(validCover?{photoCover:r.photoCover}:{})
  };
  return {...emptyRecipe(bread,cloth),...cover,...(r.baseRemoved===true?{baseRemoved:true}:{}),strokes:r.baseRemoved===true?[]:marks(r.strokes),pieces:r.pieces.map(p=>{
    const dem=clamp(Math.floor(Number.isFinite(p.dem)?p.dem:0),0,10);
    const loose=pantry[p.food].bread||pantry[p.food].drink;
    const xLimit=loose?1.6:1.3,zLimit=loose?1.6:.8;
    const opening=openingPercent(p);
    return {food:p.food,x:round(clamp(p.x,-xLimit,xLimit)),z:round(clamp(p.z,-zLimit,zLimit)),a:round(p.a%(Math.PI*2)),dem,
      water:clamp(Math.floor(Number.isFinite(p.water)?p.water:0),0,10-dem),...(opening?(p.food==='ayran'?{peel:opening}:{prepared:true}):{}),
      ...(canMirror(p.food)&&p.mirrored===true?{mirrored:true}:{}),
      ...(slices.has(p.food)&&['thin','thick'].includes(p.thickness)?{thickness:p.thickness}:{}),
      ...(p.food==='pepper-ring'&&p.taper===true?{taper:true}:{}),
      ...(!pantry[p.food].drink&&p.marks?.length?{marks:marks(p.marks)}:{})};
  })};
}
// Bound work as well as bytes before rendering a scene from another browser.
// A handful of zig-zags can cost more to paint than many short, smooth lines.
export function shareableRecipe(input){
  const recipe=readRecipe(input);
  if(!recipe)return null;
  let points=0,travel=0;
  for(const marks of [recipe.strokes,...recipe.pieces.map(piece=>piece.marks||[])]){
    for(const {line} of marks){
      points+=line.length;
      for(let i=1;i<line.length;i++)travel+=Math.hypot(line[i][0]-line[i-1][0],line[i][1]-line[i-1][1]);
    }
  }
  return points<=5000&&travel<=80000?recipe:null;
}
export function recipeFromHash(hash) {
  try {if(!hash.startsWith('#simit=')||hash.length>750000)return null;return shareableRecipe(JSON.parse(atob(hash.slice(7))));}catch{return null;}
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
