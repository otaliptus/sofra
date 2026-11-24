import { mountMusic, musicCredits } from './music.js?v=servings';
import { createBoard, cameraNames } from './board-3d.js?v=servings';
import { mountShelf } from './shelf.js?v=servings';
import { breads, cloths, ingredients, pantry, isTool, emptyRecipe, readRecipe, recipeFromHash, recipeURL, photoStore, clamp, round, photoCovers, photoCoverFor, boundedCoverPose } from './recipe.js?v=servings';
import { teaName } from './model.js?v=servings';
import { images as teaImages, drawPour } from './drawing.js?v=servings';

const $=selector=>document.querySelector(selector);
const canvas=$('#scene'),stage=$('#stage'),sheet=$('#sheet'),turn=$('#turn'),knife=$('#knife');
const pieceAction=$('#piece-action');
const coverSelect=$('#photo-cover');
for(const [id,name] of Object.entries(photoCovers))coverSelect.add(new Option(name,id));
const storeKey='sofra.simit.workbench.v2';
function read(key){try{return localStorage.getItem(key)}catch{return null}}
function write(key,value){try{localStorage.setItem(key,value)}catch{/* Storage may be disabled. */}}
function draft(){try{return readRecipe(JSON.parse(read(storeKey)))}catch{return null}}
const shared=recipeFromHash(location.hash);
let recipe=shared||draft()||emptyRecipe();
if(shared){write(storeKey,JSON.stringify(recipe));history.replaceState(null,'',location.pathname+location.search);}
let board,selected=-1,brush=null,gesture=null,mode='edit',angle='tilt',snapshot=null;
const music=mountMusic(read('sofra.sound')==='off',muted=>write('sofra.sound',muted?'off':'on'));
let audioContext,noticeTimer,teaFrame=0,albumDB;
const historyStack=[];
for(const [id,cloth] of Object.entries(cloths)){
  const button=document.createElement('button');
  button.type='button';button.textContent=cloth.name;button.dataset.cloth=id;
  button.style.setProperty('--swatch','url("./assets/'+cloth.asset+'.webp")');
  button.style.setProperty('--sample-size',id==='kareli'?'80px':'34px');
  button.onclick=()=>{
    if(!board||gesture||id===recipe.cloth)return;
    checkpoint();recipe.cloth=id;board.changeCloth(id);showCloth();showHandle();save();
  };
  $('#cloths').append(button);
}
function showCloth(){
  stage.style.setProperty('--cloth-image','url("./assets/'+cloths[recipe.cloth].asset+'.webp")');
  for(const button of $('#cloths').children){
    button.disabled=!board;
    button.setAttribute('aria-pressed',String(button.dataset.cloth===recipe.cloth));
  }
}
showCloth();
function save(){write(storeKey,JSON.stringify(recipe));}
function checkpoint(){historyStack.push(JSON.stringify(recipe));if(historyStack.length>35)historyStack.shift();}
function hint(message,duration=2600){
  clearTimeout(noticeTimer);const node=$('#coach');node.textContent=message;node.hidden=!message;
  if(message&&duration)noticeTimer=setTimeout(()=>node.hidden=true,duration);
}
function showHandle(){
  const photo=mode==='camera',editing=!photo&&!gesture;
  const p=photo?board?.coverHandle():board?.handle(selected);
  turn.hidden=!p||Boolean(gesture&&!['cover-turn','turn'].includes(gesture.kind));
  turn.setAttribute('aria-label',photo?'Üst parçayı döndür':'Malzemeyi döndür');
  if(!turn.hidden){turn.style.left=p.x+'px';turn.style.top=p.y+'px';}
  pieceAction.hidden=!editing||(!p&&!historyStack.length);
  pieceAction.dataset.action=p?'remove':'undo';
  pieceAction.textContent=p?'Kaldır':'Geri al';
  if(editing)pieceAction.setAttribute('aria-label',p?pantry[recipe.pieces[selected].food].name+' · Kaldır':'Geri al');
}
function showCoverChoice(){
  const custom=coverSelect.querySelector('[value="custom"]');
  custom.hidden=custom.disabled=!recipe.photoCoverPose;
  coverSelect.value=photoCoverFor(recipe);
}
function keepCover(){
  recipe.photoCoverPose=boundedCoverPose(board.coverPose());recipe.photoCover='custom';
  showCoverChoice();showHandle();save();
}
function coverHint(){
  hint(board.coverPose()?'Üst parçayı sürükle · ⟳ ile döndür.':'Açıyı değiştirmek için sürükle.',2600);
}
function countMarks(){return recipe.pieces.reduce((sum,p)=>sum+(p.marks?.length||0),recipe.strokes.length);}
function describeCanvas(){canvas.setAttribute('aria-label',breads[recipe.bread??'simit'].name+' · '+countMarks()+' iz · '+recipe.pieces.length+' malzeme');}
function lidButton(){
  const button=$('#lid');button.hidden=mode!=='edit'||!breads[recipe.bread??'simit'].closable;
  button.textContent=recipe.closed?'Sandviçi aç':'Sandviçi kapat';button.setAttribute('aria-pressed',String(!!recipe.closed));
}
$('#lid').onclick=()=>{checkpoint();recipe.closed=!recipe.closed;delete recipe.photoCover;selected=-1;chooseBrush(null);update();};
function update(settle=false){
  board.sync(recipe,settle);lidButton();showCloth();showHandle();save();
  describeCanvas();
}
function undo(){
  if(!historyStack.length)return;
  recipe=JSON.parse(historyStack.pop());selected=-1;chooseBrush(null);update();
}
function removeSelected(){
  if(selected<0||!recipe.pieces[selected]||mode!=='edit'||recipe.closed)return;
  checkpoint();recipe.pieces.splice(selected,1);selected=-1;update(true);
}
pieceAction.onclick=()=>{
  if(selected>=0)removeSelected();else undo();
  canvas.focus({preventScroll:true});
};
function clink(kind){
  if(music.muted)return;
  try{
    audioContext||=new AudioContext();void audioContext.resume();
    const ac=audioContext,t=ac.currentTime,gain=ac.createGain();gain.connect(ac.destination);
    if(kind==='spread'){
      const n=Math.ceil(ac.sampleRate*.09),buffer=ac.createBuffer(1,n,ac.sampleRate),samples=buffer.getChannelData(0);
      for(let i=0;i<n;i++)samples[i]=(Math.random()*2-1)*(1-i/n);
      const source=ac.createBufferSource(),filter=ac.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1600;
      source.buffer=buffer;source.connect(filter).connect(gain);gain.gain.value=.045;source.start();return;
    }
    const osc=ac.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(kind==='cay'?1640:230,t);
    osc.frequency.exponentialRampToValueAtTime(kind==='cay'?1000:85,t+.09);gain.gain.setValueAtTime(.085,t);gain.gain.exponentialRampToValueAtTime(.0001,t+.16);osc.connect(gain);osc.start();osc.stop(t+.17);
  }catch{/* The board works with sound muted. */}
}
function chooseBrush(food){
  const kind=pantry[food]?.kind;
  brush=food;knife.hidden=true;canvas.dataset.cursor=kind||'';
  knife.dataset.tool=kind||'';knife.dataset.ingredient=food||'';
  const blade=$('#utensil'),load=$('#knife-load'),done=$('#put-down');
  done.hidden=!food;
  if(food){
    const tool=kind==='spread'?(food==='cream'?'Bıçağı':'Kaşığı'):kind==='sauce'?'Şişeyi':'Baharatı';
    done.querySelector('span').textContent=tool+' bırak';
    const asset=kind==='spread'?(food==='cream'?'knife':'serving-spoon'):kind==='sauce'?'bottle-'+food:food;
    blade.src='./assets/'+asset+'.webp';
    load.hidden=kind!=='spread';if(kind==='spread')load.src='./assets/smear-'+food+'.webp';
    selected=-1;showHandle();
    hint(kind==='sauce'?'Basılı tutarak sık, sürükleyerek gezdir.':kind==='spice'?'Dokunarak serp.':
      food==='menemen'?'Dokunarak bir kaşık koy, sürükleyerek paylaştır.':'Dokunarak koy, sürükleyerek yay.');
  }else hint('');
  for(const b of document.querySelectorAll('.food[aria-pressed]'))b.setAttribute('aria-pressed',String(b.dataset.food===food));
}
$('#put-down').onclick=()=>{if(gesture)return;chooseBrush(null);canvas.focus({preventScroll:true});};
function makePiece(food,x,z){return {food,x:round(x),z:round(z),a:0,dem:0,water:0};}
function releasePiece(p,previous=-1){
  const support=board.support(p,recipe.pieces.length,previous);
  if(previous<0 && !support.stable){board.slip(p);hint('Kaydı!',1000);return;}
  if(previous<0 && recipe.pieces.length>=80){hint('Tabak dolu.');return;}
  checkpoint();if(previous>=0)recipe.pieces.splice(previous,1);
  if(support.stable){
    p.x=round(p.x);p.z=round(p.z);p.a=round(p.a);
    recipe.pieces.push(p);update(previous>=0);selected=recipe.pieces.indexOf(p);showHandle();if(selected>=0)board.land(p);clink(p.food);hint('');
  }else{selected=-1;update(true);board.slip(p);clink('drop');}
}
function pickFood(id,x,z){
  if(!board||gesture)return;
  if(mode==='camera'){leaveCamera();return;}
  if(recipe.closed){hint('Önce sandviçi aç.');return;}
  if(isTool(id)){chooseBrush(brush===id?null:id);return;}
  chooseBrush(null);
  if(x===undefined){
    if(id==='cay'){x=.48;z=.32;}
    else{({x,z}=board.landingSpot(recipe.pieces.length));}
  }
  releasePiece(makePiece(id,x,z));
}
function shelfPoint(x,y){
  const b=stage.getBoundingClientRect();return board.pick(b.left+x,b.top+y)||board.xy(b.left+x,b.top+y);
}
const resetShelf=mountShelf(stage,pickFood,(food,x,y)=>{
  if(!board||gesture)return;
  if(isTool(food)&&!recipe.closed&&mode==='edit'){
    const box=stage.getBoundingClientRect(),hit=board.pick(box.left+x,box.top+y,false);
    chooseBrush(food);if(edible(hit))placeServing(hit);
  }else{const p=shelfPoint(x,y);pickFood(food,p.x,p.z);}
},ingredients,(food,x,y)=>{
  if(!board||mode!=='edit'||recipe.closed)return;
  if(food&&pantry[food].kind==='topping'){
    const p=shelfPoint(x,y);board.lift(makePiece(food,p.x,p.z));
  }else {board.lift(null);return !food;}
});
function moveKnife(e){
  if(!brush||mode!=='edit'||e.pointerType==='touch'){knife.hidden=true;return;}
  const r=stage.getBoundingClientRect();
  if(gesture?.lastScreen){
    const dx=e.clientX-gesture.lastScreen[0],dy=e.clientY-gesture.lastScreen[1];
    if(Math.hypot(dx,dy)>1)knife.style.setProperty('--tilt',clamp(-14+dy*.6-dx*.14,-33,12)+'deg');
  }
  if(gesture?.kind==='ink')gesture.lastScreen=[e.clientX,e.clientY];
  knife.style.left=(e.clientX-r.left)+'px';knife.style.top=(e.clientY-r.top)+'px';knife.hidden=false;
}
function edible(hit){return hit && recipe.pieces[hit.i]?.food!=='cay';}
function newMark(hit){
  const marks=hit.i===-1?recipe.strokes:(recipe.pieces[hit.i].marks||=[]);
  const mark={food:brush,line:[]};marks.push(mark);return mark;
}
function markPoint(hit){return [Math.round(clamp(hit.u,0,1)*1024),Math.round(clamp(hit.v,0,1)*1024)];}
function placeServing(hit){
  if(countMarks()>=200){hint('Tabak dolu.');return;}
  checkpoint();newMark(hit).line.push(markPoint(hit));update();clink('spread');hint('');
}
let paintFrame=0;
function refreshInk(){
  if(!paintFrame)paintFrame=requestAnimationFrame(()=>{paintFrame=0;board.paintBread(recipe.strokes);});
}
function inkPoint(hit){
  if(!edible(hit)){gesture.stroke=null;gesture.last=null;return;}
  const last=gesture.last;
  if(gesture.stroke&&last?.i===hit.i&&Math.hypot(last.x-hit.x,last.z-hit.z)<.003)return;
  if(!gesture.stroke||last?.i!==hit.i||gesture.stroke.line.length>=150){
    if(countMarks()>=200)return;
    gesture.stroke=newMark(hit);
  }
  gesture.stroke.line.push(markPoint(hit));gesture.last=hit;refreshInk();
}
function growBead(g){
  if(gesture!==g||g.moved||!g.stroke)return;
  const amount=round(1+1.6*clamp((performance.now()-g.start-160)/720,0,1));
  if(amount>1&&g.stroke.portion!==amount){g.stroke.portion=amount;refreshInk();}
  if(amount<2.6)g.holdFrame=requestAnimationFrame(()=>growBead(g));
}
function freeRotate(dx,dy){
  const scale=Math.PI*2/Math.max(320,canvas.clientWidth*.9);
  board.rotate(dx*scale,-dy*Math.PI/Math.max(220,canvas.clientHeight));
  if(mode==='camera'){
    angle='free';for(const b of $('#views').children)b.setAttribute('aria-pressed','false');
  }
  showHandle();hint('');
}
function begin(e){
  if(!board||gesture||![0,2].includes(e.button))return;
  canvas.setPointerCapture(e.pointerId);
  if(mode==='camera'&&e.button===0){
    const anchor=board.pickCover(e.clientX,e.clientY);
    if(anchor){
      gesture={kind:'cover-move',id:e.pointerId,anchor,px:e.clientX,py:e.clientY,moved:false};
      canvas.dataset.cursor='held';hint('');showHandle();return;
    }
  }
  const hit=mode==='edit'&&board.pick(e.clientX,e.clientY,!brush);
  if(mode==='camera'||recipe.closed||e.button===2||!hit){
    gesture={kind:'orbit',id:e.pointerId,px:e.clientX,py:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.dataset.cursor='held';knife.hidden=true;return;
  }
  if(brush){
    if(!edible(hit)||countMarks()>=200){hint(edible(hit)?'Tabak dolu.':'Ekmeğe veya bir malzemeye dokun.');return;}
    checkpoint();gesture={kind:'ink',id:e.pointerId,stroke:null,last:null,px:e.clientX,py:e.clientY,start:performance.now(),moved:false};
    moveKnife(e);inkPoint(hit);if(pantry[brush].kind==='sauce')growBead(gesture);
    clink('spread');hint('');return;
  }
  if(!hit||hit.i<0){selected=-1;showHandle();return;}
  chooseBrush(null);selected=hit.i;const p=recipe.pieces[selected];
  gesture={kind:'piece',id:e.pointerId,i:selected,from:{...p},px:e.clientX,py:e.clientY,lastX:e.clientX,
    y:hit.y,dx:p.x-hit.x,dz:p.z-hit.z,moved:false};
  showHandle();canvas.dataset.cursor='held';
}
function move(e){
  if(!board)return;
  if(gesture?.kind==='cover-move'&&e.pointerId===gesture.id){
    if(!gesture.moved&&Math.hypot(e.clientX-gesture.px,e.clientY-gesture.py)<3)return;
    gesture.moved=true;board.dragCover(gesture.anchor,e.clientX,e.clientY);return;
  }
  if(gesture?.kind==='orbit'&&e.pointerId===gesture.id){
    if(!gesture.moved&&Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY)<3)return;
    gesture.moved=true;freeRotate(e.clientX-gesture.px,e.clientY-gesture.py);gesture.px=e.clientX;gesture.py=e.clientY;return;
  }
  if(mode!=='edit'){
    if(!gesture&&e.pointerType==='mouse')canvas.dataset.cursor=board.pickCover(e.clientX,e.clientY)?'cover':'orbit';
    return;
  }
  moveKnife(e);
  if(!gesture){
    const hit=board.pick(e.clientX,e.clientY);
    if(brush&&!edible(hit))knife.hidden=true;
    canvas.dataset.cursor=(edible(hit)&&pantry[brush]?.kind)||(hit?.i>=0?'move':hit?'':'orbit');return;
  }
  if(e.pointerId!==gesture.id)return;
  if(gesture.kind==='ink'){
    const g=gesture,dx=e.clientX-g.px,dy=e.clientY-g.py;
    if(!g.moved&&Math.hypot(dx,dy)<3)return;
    g.moved=true;
    // Sample fast drags between events so gaps in the bread break the stroke.
    const steps=Math.min(36,Math.max(1,Math.ceil(Math.hypot(dx,dy)/7)));
    for(let k=1;k<=steps;k++)inkPoint(board.pick(g.px+dx*k/steps,g.py+dy*k/steps,false));
    g.px=e.clientX;g.py=e.clientY;return;
  }
  if(gesture.kind!=='piece')return;
  gesture.moved ||= Math.hypot(e.clientX-gesture.px,e.clientY-gesture.py)>4;
  if(gesture.moved){
    const pos=board.xy(e.clientX,e.clientY,gesture.y);
    gesture.next={...gesture.from,x:round(pos.x+gesture.dx),z:round(pos.z+gesture.dz)};
    board.lift(gesture.next,gesture.i,(e.clientX-gesture.lastX)*.006);gesture.lastX=e.clientX;
  }
}
function ended(e){
  if(!gesture||e.pointerId!==gesture.id)return;
  const g=gesture;gesture=null;canvas.dataset.cursor=pantry[brush]?.kind||'';
  if(g.kind==='cover-move'&&g.moved){
    if(e.type==='pointerup')keepCover();else board.restoreCover();
  }
  if(g.kind==='orbit'&&!g.moved&&e.type==='pointerup'&&mode==='edit'){chooseBrush(null);selected=-1;}
  if(g.kind==='ink'){
    cancelAnimationFrame(g.holdFrame);cancelAnimationFrame(paintFrame);paintFrame=0;
    if(e.type!=='pointerup')recipe=JSON.parse(historyStack.pop());
    update();
    if(e.pointerType==='touch')knife.hidden=true;
  }else if(g.kind==='piece'){
    board.lift(null);
    if(e.type!=='pointercancel'&&g.moved)releasePiece(g.next,g.i);
    else if(e.type!=='pointercancel'&&g.from.food==='cay')openTea();
  }
  showHandle();
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('dblclick',e=>{
  if(!board)return;
  if(mode==='camera'){if(!board.pickCover(e.clientX,e.clientY))camera('tilt');return;}
  if(!board.pick(e.clientX,e.clientY)){board.resetOrbit();showHandle();}
});
canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointermove',move);
canvas.addEventListener('pointerup',ended);canvas.addEventListener('pointercancel',ended);
canvas.addEventListener('lostpointercapture',e=>{if(gesture?.kind==='cover-move'||gesture?.kind==='ink')ended(e);});
canvas.addEventListener('pointerleave',()=>knife.hidden=true);
function angleAt(e,p){const q=board.xy(e.clientX,e.clientY,board.handle(selected)?.height||0);return Math.atan2(q.z-p.z,q.x-p.x);}
function coverAngle(e,pose,height){
  const q=board.coverPlanePoint(e.clientX,e.clientY,height);
  if(!q||Math.hypot(q.x-pose.x,q.z-pose.z)<.015)return null;
  return Math.atan2(q.z-pose.z,q.x-pose.x);
}
function twistCover(delta){
  const pose=board.coverPose();if(!pose)return;
  board.adjustCover({...pose,yaw:pose.yaw+delta});keepCover();hint('');
}
turn.onpointerdown=e=>{
  if(gesture||e.button!==0)return;
  if(mode==='camera'){
    const pose=board.coverPose();if(!pose)return;
    const height=board.coverHandle().height,start=coverAngle(e,pose,height);
    if(start===null)return;
    turn.setPointerCapture(e.pointerId);hint('');
    gesture={kind:'cover-turn',id:e.pointerId,pose,height,start,px:e.clientX,py:e.clientY,moved:false};return;
  }
  const p=recipe.pieces[selected];if(!p)return;
  turn.setPointerCapture(e.pointerId);gesture={kind:'turn',id:e.pointerId,a:p.a,start:angleAt(e,p),old:JSON.stringify(recipe)};
};
turn.onpointermove=e=>{
  if(gesture?.kind==='cover-turn'&&e.pointerId===gesture.id){
    const g=gesture;
    if(!g.moved&&Math.hypot(e.clientX-g.px,e.clientY-g.py)<2)return;
    const next=coverAngle(e,g.pose,g.height);if(next===null)return;
    g.moved=true;board.adjustCover({...g.pose,yaw:g.pose.yaw+g.start-next});showHandle();return;
  }
  if(gesture?.kind!=='turn'||e.pointerId!==gesture.id)return;
  const p=recipe.pieces[selected];p.a=round(gesture.a+gesture.start-angleAt(e,p));board.sync(recipe);
  const h=board.handle(selected);turn.style.left=h.x+'px';turn.style.top=h.y+'px';
};
turn.onpointerup=turn.onpointercancel=e=>{
  if(gesture?.kind==='cover-turn'&&e.pointerId===gesture.id){
    const moved=gesture.moved;gesture=null;
    if(e.type!=='pointerup'){board.restoreCover();showHandle();}
    else if(moved)keepCover();else twistCover(Math.PI/12);
    return;
  }
  if(gesture?.kind!=='turn'||e.pointerId!==gesture.id)return;
  const g=gesture;gesture=null;
  if(e.type==='pointercancel')recipe.pieces[selected].a=g.a;
  else{if(Math.abs(recipe.pieces[selected].a-g.a)<.01)recipe.pieces[selected].a+=Math.PI/12;recipe.pieces[selected].a=round(recipe.pieces[selected].a%(Math.PI*2));historyStack.push(g.old);}
  update();
};
turn.onlostpointercapture=e=>{if(gesture?.kind==='cover-turn')turn.onpointercancel(e);};
turn.onclick=e=>{
  if(mode==='camera'){if(e.detail===0)twistCover(Math.PI/12);return;}
  if(e.detail!==0||selected<0)return;
  checkpoint();recipe.pieces[selected].a=round((recipe.pieces[selected].a+Math.PI/12)%(2*Math.PI));update();
};
canvas.addEventListener('wheel',e=>{
  if(!board||gesture)return;
  if(mode==='camera'){
    if(!e.ctrlKey&&e.deltaY&&board.pickCover(e.clientX,e.clientY)){
      e.preventDefault();
      const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);
      twistCover(clamp(pixels*.002,-Math.PI/8,Math.PI/8));
    }
    return;
  }
  const i=board.pick(e.clientX,e.clientY)?.i??-1;if(i<0||recipe.closed)return;
  e.preventDefault();checkpoint();selected=i;recipe.pieces[i].a=round((recipe.pieces[i].a+Math.sign(e.deltaY)*.14)%(2*Math.PI));update();
},{passive:false});
function dialog(title,html){
  $('#sheet-content').innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+title+'</h2><button class="close" aria-label="Kapat">×</button></div>'+html;
  sheet.setAttribute('aria-labelledby','dialog-title');if(!sheet.open)sheet.showModal();
  $('.close').onclick=()=>sheet.close();
}
sheet.addEventListener('close',()=>{cancelAnimationFrame(teaFrame);});
sheet.addEventListener('click',e=>{if(e.target===sheet)sheet.close();});
$('#help').onclick=()=>dialog('Nasıl oynanır?','<ul><li>Malzemeyi raftan alıp ekmeğin üstüne veya tabağa bırak. Seçili malzemeyi yuvarlak tutamaçla döndür, Kaldır düğmesiyle kaldır.</li><li>Kâseyi seç. Tek dokunuş bir porsiyon koyar. Kaymağı bıçakla yay, reçel ve menemeni kaşıkla gezdir. Ketçap ve mayonez için basılı tutarak bir damla sık veya sürükleyerek ince bir şerit çiz. Aleti bırakmak için × düğmesine dokun.</li><li>Sofranın boş bir yerini sürükleyerek etrafında dön. Fareyle sağ tuşu da kullanabilirsin. Boş bir yere çift dokununca tepeden bakarsın.</li><li>Foto’da üst parçayı sürükle, ⟳ tutamacıyla döndür. Kamerayı çevirmek için sofrayı sürükle. Foto’ya tekrar basınca çekersin.</li></ul><p>Klavye ile rafta okları ve Enter’ı kullan. Tabakta [ ve ] ile seç, oklarla taşı, R ile döndür, Delete ile kaldır. Foto’da ⟳ odaktayken oklarla üst parçayı taşı. R ve Shift+R ile ince döndür. Sofra odaktayken oklar kamerayı çevirir. Geri almak için Ctrl/⌘ Z.</p>'+musicCredits());
function startBreakfast(id,cloth,random=false){
  checkpoint();recipe=emptyRecipe(id,cloth);selected=-1;chooseBrush(null);
  if(random){
    board.sync(recipe);
    const solids=ingredients.filter(f=>f.kind==='topping'&&f.id!=='cay'),count=3+Math.floor(Math.random()*6);
    for(let i=0;i<count;i++){
      const pos=board.landingSpot(i),item=solids[Math.floor(Math.random()*solids.length)];
      recipe.pieces.push({...makePiece(item.id,pos.x,pos.z),a:round(Math.random()*6.28)});
    }
  }
  if(sheet.open)sheet.close();
  if(mode==='camera')leaveCamera();
  board.resetOrbit();update();hint(random?'':'Bir malzeme seç.');
}
$('#grand-reset').onclick=()=>{
  if(!board)return;
  gesture=null;board.lift(null);resetShelf();angle='tilt';
  startBreakfast('simit','kareli');
  canvas.focus({preventScroll:true});
};
$('#fresh').onclick=()=>{
  const options=Object.entries(breads).map(([id,b])=>'<button data-bread="'+id+'" '+(id==='simit'?'id="plain"':'')+'><img alt="" src="./assets/'+b.asset+'.webp"><span>'+b.name+'</span></button>').join('');
  dialog('Ekmek seç','<div class="bread-options">'+options+'</div><div class="buttons"><button id="random">Rastgele hazırla</button><button id="undo">Geri al</button></div>');
  $('#undo').disabled=!historyStack.length;$('#undo').onclick=()=>{undo();sheet.close();};
  for(const b of $('.bread-options').children)b.onclick=()=>startBreakfast(b.dataset.bread,recipe.cloth);
  $('#random').onclick=()=>startBreakfast(recipe.bread,recipe.cloth,true);
};
function openTea(){
  const p=recipe.pieces[selected];if(!p||p.food!=='cay')return;
  dialog('Çay doldur','<canvas id="glass" width="480" height="285" aria-label="Çay bardağı"></canvas><div class="tea-tools"><button id="dem"><img src="./assets/demlik.webp" alt="">Dem</button><button id="water"><img src="./assets/kettle.webp" alt="">Sıcak su</button></div><p class="readout"></p><div class="buttons"><button id="drain">Boşalt</button><button id="remove-glass">Bardağı kaldır</button><button class="primary" id="serve">Servis et</button></div>');
  const glass=$('#glass'),ctx=glass.getContext('2d');
  for(const [button,id] of [['dem','demlik'],['water','kettle']]){
    const img=$('#'+button+' img');
    if(img.complete&&img.naturalWidth)teaImages[id]=img;
    else img.onload=()=>{teaImages[id]=img;};
  }
  function show(kind=null){
    const total=p.dem+p.water;$('#dem').disabled=$('#water').disabled=total>=10;
    $('#drain').disabled=!total;$('.readout').textContent=teaName(p)+' · '+total*10+'%';
    cancelAnimationFrame(teaFrame);const start=performance.now();
    function frame(now){const t=clamp((now-start)/550,0,1);drawPour(ctx,{...p,type:'cay',angle:0},t<1?kind:null,t);if(kind&&t<1)teaFrame=requestAnimationFrame(frame);}
    frame(start);
  }
  for(const k of ['dem','water'])$('#'+k).onclick=()=>{if(p.dem+p.water>=10)return;checkpoint();p[k]++;update();show(k);clink('cay');};
  $('#remove-glass').onclick=()=>{sheet.close();removeSelected();canvas.focus({preventScroll:true});};
  $('#drain').onclick=()=>{checkpoint();p.dem=p.water=0;update();show();};$('#serve').onclick=()=>sheet.close();show();
}
function camera(a){
  if(gesture)return;
  mode='camera';angle=a;selected=-1;chooseBrush(null);hint('');showHandle();$('#game').classList.add('camera');
  $('#back').hidden=$('#views').hidden=$('#finder').hidden=$('#cover-control').hidden=false;
  showCoverChoice();
  for(const b of $('#views').children)b.setAttribute('aria-pressed',String(b.dataset.angle===a));
  board.setView(a);lidButton();showHandle();canvas.focus({preventScroll:true});coverHint();
}
function leaveCamera(){
  if(gesture)return;
  mode='edit';$('#game').classList.remove('camera');$('#back').hidden=$('#views').hidden=$('#finder').hidden=$('#cover-control').hidden=true;board.setView(null);showHandle();lidButton();hint('');
}
coverSelect.onchange=()=>{
  if(mode!=='camera'||!Object.hasOwn(photoCovers,coverSelect.value))return;
  if(gesture){showCoverChoice();return;}
  recipe.photoCover=coverSelect.value;board.refreshCover();showHandle();save();coverHint();
};
for(const [id,name] of Object.entries(cameraNames)){
  const btn=document.createElement('button');btn.dataset.angle=id;btn.textContent=name;btn.onclick=()=>camera(id);$('#views').append(btn);
}
$('#back').onclick=leaveCamera;
function toBlob(canvas,type,quality){return new Promise((res,rej)=>canvas.toBlob(blob=>blob?res(blob):rej(Error('Photo export failed')),type,quality));}
function fetchAlbum(action,record){albumDB ||= photoStore();return albumDB(action,record);}
function photoPreview(record,fromAlbum=false){
  if(snapshot)URL.revokeObjectURL(snapshot);snapshot=URL.createObjectURL(record.blob);
  dialog(record.id?'Sofra № '+record.id:'Fotoğraf','<img class="print" alt="Simit fotoğrafı"><div class="buttons">'+(fromAlbum?'<button id="remix" class="primary">Sofraya ekle</button>':'<button id="keep" class="primary">Sakla</button>')+'<a id="png" download="sofra.png">İndir</a><button id="share">Bağlantı</button></div><p class="feedback" role="status"></p>');
  $('.print').src=snapshot;$('#png').href=snapshot;
  if(!fromAlbum)$('#keep').onclick=async()=>{
    const button=$('#keep');button.disabled=true;
    try{record.id=await fetchAlbum('keep',record);photoPreview(record,true);}
    catch{button.disabled=false;$('.feedback').textContent='Albüm kaydedilemedi. Fotoğrafı indirebilirsin.';}
  };
  if(fromAlbum)$('#remix').onclick=()=>{checkpoint();recipe=readRecipe(record.recipe)||emptyRecipe();sheet.close();leaveCamera();update();};
  $('#share').onclick=async()=>{
    const link=recipeURL(record.recipe);
    try{await navigator.clipboard.writeText(link);$('.feedback').textContent='Bağlantı kopyalandı.';}
    catch{const input=document.createElement('input');input.readOnly=true;input.value=link;$('.feedback').replaceChildren(input);input.select();}
  };
}
$('#shutter').onclick=async()=>{
  if(!board||gesture)return;
  if(mode==='edit'){camera(board.hasEditPose()?'free':'tilt');return;}
  const output=board.capture(),record={recipe:structuredClone(recipe),angle,pose:board.pose(),date:Date.now()};
  record.blob=await toBlob(output,'image/png');const thumb=document.createElement('canvas');thumb.width=thumb.height=128;thumb.getContext('2d').drawImage(output,0,0,128,128);record.thumb=thumb.toDataURL('image/webp',.72);
  if(mode==='camera')photoPreview(record);
};
$('#album').onclick=async()=>{
  dialog('Albümüm','<div class="gallery"></div><p class="feedback"></p>');
  const gallery=$('.gallery');
  try{
    const records=await fetchAlbum('list');if(!gallery.isConnected)return;
    if(!records.length)$('.feedback').textContent='İlk fotoğrafını çek ve Sakla’ya bas.';
    for(const r of records.reverse()){
      const b=document.createElement('button'),img=new Image();img.src=r.thumb;img.alt='Sofra '+r.id;
      const label=document.createElement('small');label.textContent='№ '+r.id;b.append(img,label);b.onclick=()=>photoPreview(r,true);gallery.append(b);
    }
  }catch{if(gallery.isConnected)$('.feedback').textContent='Bu tarayıcıda albüm kullanılamıyor.';}
  if(read('sofra.table.v1') && gallery.isConnected){const p=document.createElement('p'),a=document.createElement('a');a.href='./table.html';a.textContent='Önceki kahvaltı masam';p.append(a);$('#sheet-content').append(p);}
};
document.addEventListener('keydown',e=>{
  if(sheet.open||!board||gesture||e.target===coverSelect)return;
  if(e.key==='Escape'){if(mode==='camera')leaveCamera();else{chooseBrush(null);selected=-1;showHandle();}return;}
  if(mode==='camera'){
    const dirs={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-16],ArrowDown:[0,16]};
    if(e.key.toLowerCase()==='r'&&!e.metaKey&&!e.ctrlKey&&board.coverPose()){
      e.preventDefault();twistCover((e.shiftKey?-1:1)*Math.PI/90);return;
    }
    if(e.target===turn&&dirs[e.key]){
      e.preventDefault();
      const pose=board.coverPose(),yaw=board.pose().yaw,[right,down]=dirs[e.key].map(Math.sign);
      board.adjustCover({...pose,x:pose.x+.015*(right*Math.cos(yaw)+down*Math.sin(yaw)),
        z:pose.z+.015*(down*Math.cos(yaw)-right*Math.sin(yaw))});keepCover();return;
    }
    if(dirs[e.key]){e.preventDefault();freeRotate(...dirs[e.key]);}
    return;
  }

  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return;}
  if(e.target!==canvas||recipe.closed)return;
  const n=recipe.pieces.length;
  if(e.key==='['||e.key===']'){selected=n?((selected<0&&e.key==='['?0:selected)+(e.key==='['?-1:1)+n)%n:-1;chooseBrush(null);showHandle();return;}
  if(brush&&['Enter',' '].includes(e.key)){
    e.preventDefault();const {x,z}=board.landingSpot(recipe.strokes.length);placeServing(board.breadUV(x,z));return;
  }
  const p=recipe.pieces[selected];if(!p)return;
  if(e.key==='Enter'&&p.food==='cay'){e.preventDefault();openTea();return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();return;}
  const dirs={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]};
  if(dirs[e.key]){e.preventDefault();const [dx,dz]=dirs[e.key];releasePiece({...p,x:p.x+dx,z:p.z+dz},selected);}
  if(e.key.toLowerCase()==='r'){checkpoint();p.a=round((p.a+.15)%(2*Math.PI));update();}
});
new ResizeObserver(showHandle).observe(stage);
window.render_game_to_text=()=>JSON.stringify({ready:!!board,mode,angle,selected,brush,music:music.state(),camera:board?.pose(),coordinates:'x right, z down, one unit is the bread width',...recipe,photoCover:photoCoverFor(recipe),visibleCoverPose:board?.coverPose()});
window.advanceTime=ms=>board?.step(ms);
try{
  board=await createBoard(canvas);update();$('#shutter').disabled=$('#grand-reset').disabled=false;
  hint(recipe.pieces.length||recipe.strokes.length?'':'Bir malzeme seç.',3600);
}catch(err){console.error(err);hint('Sofra açılamadı. WebGL destekli bir tarayıcıda yenile.',0);}
