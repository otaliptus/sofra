import {clothArt,foodArt,recipeArt,prepareArt} from './board-art.js';
import {editBread} from './bread-state.js';
import { workflow, photoEdges, finishGesture } from './workflows.js';
import { boardWrite, publicURL } from './pano-api.js';
import { assetURL, thumbnailURL } from './asset-url.js';
import { serveDrink, serviceControls } from './drink-service.js?v=free-peel';
import { editHistory } from './undo-history.js';
import { chooseSlice } from './slicing.js';
import { mountMusic, musicCredits } from './music.js?v=opt-in';
import { createBoard, cameraNames } from './board-3d.js?v=gazete';
import { mountShelf } from './shelf.js?v=shelf-halves';
import { breads, cloths, ingredients, pantry, pasteRemaining, canMirror, canSlice, cutServings, wholeCuts, openingPercent, isTool, emptyRecipe, readRecipe, recipeFromHash, recipeURL, photoStore, clamp, round, photoCovers, photoCoverFor, boundedCoverPose } from './recipe.js?v=gazete';
import { teaName } from './model.js?v=servings';
import { images as teaImages, drawPour } from './drawing.js?v=servings';

const $=selector=>document.querySelector(selector);
const canvas=$('#scene'),stage=$('#stage'),sheet=$('#sheet'),turn=$('#turn'),knife=$('#knife');
const pieceAction=$('#piece-action'),undoAction=$('#undo-action');
const mirrorAction=$('#mirror-action'),sliceAction=$('#slice-action');
const breadSelection=-2,coverSelection=-3;
const coverSelect=$('#photo-cover');
for(const [id,name] of Object.entries(photoCovers))coverSelect.add(new Option(name,id));
const storeKey='sofra.simit.workbench.v2';
function read(key){try{return localStorage.getItem(key)}catch{return null}}
function write(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}
function draft(){try{return JSON.parse(read(storeKey));}catch{return null;}}
const stored=draft(),savedRecipe=readRecipe(stored);
let recipe=savedRecipe||emptyRecipe();
function selectionFor(index){
  if(index===coverSelection&&!recipe.coverRemoved)return coverSelection;
  if(index===breadSelection && !recipe.baseRemoved)return breadSelection;
  return Number.isInteger(index)&&recipe.pieces[index]?index:-1;
}
let board,selected=selectionFor(stored?.editSelection),brush=null,gesture=null,mode='edit',angle='tilt',snapshot=null;
const historyStack=editHistory(savedRecipe&&stored?.editHistory);
const music=mountMusic(read('sofra.sound')==='off',muted=>write('sofra.sound',muted?'off':'on'));
let audioContext,noticeTimer,teaFrame=0,drinkService=null,albumDB;
const photos=workflow(photoEdges);
let wheelTurn=null;
// Fetch cold choices concurrently, but apply shelf clicks in input order.
const artQueue=[];
function drainArt(){
  while(board&&!gesture&&artQueue.length){
    const job=artQueue[0];
    if(job.recipe!==recipe||job.visit!==photos.visit||job.open!==sheet.open){artQueue.shift();continue;}
    if(!job.ready)return;
    artQueue.shift();
    if(job.error)hint('Malzeme yüklenemedi. Tekrar dene.');
    else job.apply();
  }
}
function withArt(ids,apply){
  const loading=prepareArt(ids);
  if(board&&!loading&&!artQueue.length){apply();return;}
  const job={apply,recipe,visit:photos.visit,open:sheet.open,ready:!loading};
  artQueue.push(job);
  loading?.then(()=>{job.ready=true;drainArt();},()=>{job.error=job.ready=true;drainArt();});
  drainArt();
}
const clothImage=id=>'url("'+new URL(assetURL(cloths[id].asset),document.baseURI).href+'")';
for(const [id,cloth] of Object.entries(cloths)){
  const button=document.createElement('button');
  button.type='button';button.textContent=cloth.name;button.dataset.cloth=id;
  button.style.setProperty('--swatch','url("'+new URL(thumbnailURL(cloth.asset),document.baseURI).href+'")');
  button.onclick=()=>{
    if(!board||gesture)return;
    withArt(clothArt(id),()=>{
      if(id===recipe.cloth)return;
      checkpoint();recipe.cloth=id;board.changeCloth(id);showCloth();showHandle();save();
    });
  };
  $('#cloths').append(button);
}
function showCloth(){
  stage.style.setProperty('--cloth-image',clothImage(recipe.cloth));
  for(const button of $('#cloths').children){
    button.disabled=!board;
    button.setAttribute('aria-pressed',String(button.dataset.cloth===recipe.cloth));
  }
}
showCloth();
function save(){
  // Store the draft and its history together. Under storage pressure keep the
  // newest steps first, and always give the breakfast itself priority.
  for(const budget of [1200000,180000,0]){
    if(write(storeKey,JSON.stringify({...recipe,editSelection:selected,editHistory:historyStack.pack(budget)})))return;
  }
}
function checkpoint(state=JSON.stringify(recipe),selection=selected){
  wheelTurn=null;historyStack.push(state,selection);
}
function checkpointWheel(target){
  const now=performance.now();
  if(wheelTurn?.target!==target||now-wheelTurn.time>350)checkpoint();
  wheelTurn={target,time:now};
}
function hint(message,duration=2600){
  clearTimeout(noticeTimer);const node=$('#coach');node.textContent=message;node.hidden=!message;
  if(message&&duration)noticeTimer=setTimeout(()=>node.hidden=true,duration);
}
function movablePiece(i){return !!recipe.pieces[i]&&(!recipe.closed||pantry[recipe.pieces[i].food].drink);}
function showHandle(){
  const editing=mode==='edit'&&!gesture,cover=mode==='camera'||selected===coverSelection;
  const p=cover?board?.coverHandle():board?.handle(selected);
  turn.dataset.target=cover?'cover':'piece';
  turn.hidden=!p||Boolean(gesture&&!['cover-turn','turn'].includes(gesture.kind));
  turn.setAttribute('aria-label',cover?'Üst parçayı döndür':'Malzemeyi döndür');
  if(!turn.hidden){turn.style.left=p.x+'px';turn.style.top=p.y+'px';}
  const selectedBread=selected===breadSelection&&!recipe.baseRemoved;
  const piece=recipe.pieces[selected],canEdit=!!board&&editing&&!recipe.closed&&!cover&&!!piece;
  mirrorAction.hidden=!canEdit||!canMirror(piece.food);
  mirrorAction.setAttribute('aria-pressed',String(!!piece?.mirrored));
  sliceAction.hidden=!canEdit||!canSlice(piece.food);
  if(!sliceAction.hidden)sliceAction.textContent=wholeCuts[piece.food]?'Dilimle':'Kalınlık';
  pieceAction.hidden=!editing||(recipe.closed&&!cover&&!movablePiece(selected))||(!p&&!selectedBread);
  if(!pieceAction.hidden){
    const name=cover?'Üst parça':selectedBread?breads[recipe.bread].name:piece.food==='ayran'&&openingPercent(piece)>0?'Açık ayran':pantry[piece.food].name;
    pieceAction.setAttribute('aria-label',name+' · Kaldır');
  }
  undoAction.disabled=!historyStack.length;
  undoAction.title='Geri al · '+historyStack.length+' adım';
  $('#edit-actions').hidden=!editing||(pieceAction.hidden&&undoAction.disabled);
}
function showCoverChoice(){
  $('#cover-control').hidden=mode!=='camera'||!!recipe.coverRemoved;
  const custom=coverSelect.querySelector('[value="custom"]');
  custom.hidden=custom.disabled=!(recipe.photoCoverPose||recipe.coverPose);
  coverSelect.value=recipe.photoCover??'table';
}
function keepCover(fromWheel=false){
  const pose=boundedCoverPose(board.coverPose());
  if(!pose)return;
  if(fromWheel)checkpointWheel('cover');else checkpoint();
  if(mode==='edit'){
    editBread(recipe,'placeTop',pose);
    board.fitEditedCover();
    lidButton();
  }else{recipe.photoCoverPose=pose;recipe.photoCover='custom';}
  showCoverChoice();showHandle();save();
}
function coverHint(){
  hint(board.coverPose()?'Üst parçayı sürükle · ⟳ ile döndür.':'Açıyı değiştirmek için sürükle.',2600);
}
function countMarks(){return recipe.pieces.reduce((sum,p)=>sum+(p.marks?.length||0),recipe.strokes.length);}
function describeCanvas(){canvas.setAttribute('aria-label',(recipe.baseRemoved?'Tabak':breads[recipe.bread??'simit'].name)+' · '+countMarks()+' iz · '+recipe.pieces.length+' malzeme');}
function lidButton(){
  const button=$('#lid');button.hidden=mode!=='edit'||!!recipe.baseRemoved||!breads[recipe.bread??'simit'].closable;
  button.textContent=recipe.closed?'Sandviçi aç':'Sandviçi kapat';button.setAttribute('aria-pressed',String(!!recipe.closed));
}
$('#lid').onclick=()=>{
  if(gesture||mode!=='edit'||recipe.baseRemoved||!breads[recipe.bread].closable)return;
  checkpoint();editBread(recipe,'toggleLid');
  selected=-1;chooseBrush(null);update();
};
function update(settle=false,focusPiece){
  board.sync(recipe,settle,!gesture);if(focusPiece)selected=recipe.pieces.indexOf(focusPiece);
  lidButton();showCloth();showHandle();save();
  describeCanvas();
}
function undo(){
  if(gesture)return;
  let entry,previous;
  while(!previous&&(entry=historyStack.peek())){
    try{previous=readRecipe(JSON.parse(entry.state));}catch{/* Skip an unreadable checkpoint. */}
    if(!previous)historyStack.pop();
  }
  if(!previous){showHandle();return;}
  withArt(recipeArt(previous),()=>{
    if(historyStack.peek()?.state!==entry.state)return;
    historyStack.pop();wheelTurn=null;recipe=previous;selected=selectionFor(entry.selected);chooseBrush(null);update();
    if(mode==='camera'){board.refreshCover();showCoverChoice();showHandle();}
  });
}
function toggleBase(){
  checkpoint();
  chooseBrush(null);
  editBread(recipe,'toggleBase',recipe.closed?board.coverPose():null);
  selected=recipe.baseRemoved?-1:breadSelection;
  update();
}
function removeSelected(){
  if(mode!=='edit'||gesture)return;
  const cover=selected===coverSelection;
  if(cover){
    if(recipe.coverRemoved)return;
    checkpoint();editBread(recipe,'removeTop');
  }else if(selected===breadSelection){
    if(recipe.baseRemoved||recipe.closed)return;
    toggleBase();return;
  }else{
    if(!movablePiece(selected))return;
    checkpoint();recipe.pieces.splice(selected,1);
  }
  selected=-1;chooseBrush(null);update(!cover);
}
function removalChoices(){
  if(gesture||mode!=='edit'||(recipe.closed&&selected!==coverSelection&&!movablePiece(selected)))return;
  const piece=recipe.pieces[selected],marks=selected===breadSelection?recipe.strokes:piece?.marks;
  if(!marks?.length){removeSelected();canvas.focus({preventScroll:true});return;}
  const foods=[...new Set(marks.map(mark=>mark.food).reverse())];
  const buttons=foods.map(food=>{
    const count=marks.filter(mark=>mark.food===food).length;
    const detail=count>1?' <small>(son kat)</small>':'';
    return '<button data-remove-mark="'+food+'">'+pantry[food].name+detail+'</button>';
  }).join('');
  const name=piece?pantry[piece.food].name:breads[recipe.bread].name+' alt yarısı';
  const whole='<button id="remove-whole">'+name+' <small>(tamamı)</small></button>';
  dialog('Ne kaldırılsın?','<div class="remove-choices">'+buttons+whole+'</div>');
  for(const button of sheet.querySelectorAll('[data-remove-mark]')){
    button.onclick=()=>{
      checkpoint();const i=marks.findLastIndex(mark=>mark.food===button.dataset.removeMark);
      marks.splice(i,1);
      if(!marks.length&&piece)delete piece.marks;
      sheet.close();chooseBrush(null);update();canvas.focus({preventScroll:true});
    };
  }
  $('#remove-whole').onclick=()=>{sheet.close();removeSelected();canvas.focus({preventScroll:true});};
}
pieceAction.onclick=removalChoices;
mirrorAction.onclick=()=>{
  const p=recipe.pieces[selected];if(mirrorAction.hidden||!p)return;
  checkpoint();if(p.mirrored)delete p.mirrored;else p.mirrored=true;
  update();canvas.focus({preventScroll:true});
};
sliceAction.onclick=()=>{
  const i=selected,p=recipe.pieces[i];if(sliceAction.hidden||!p)return;
  chooseSlice(p,81-recipe.pieces.length,{sheet,dialog,apply(thickness){
    const pieces=cutServings(p,thickness);
    sheet.close();canvas.focus({preventScroll:true});
    if(!pieces.length||(!wholeCuts[p.food]&&thickness===(p.thickness||'regular')))return;
    if(wholeCuts[p.food])pieces.forEach(piece=>board.placeCut(piece,i));
    checkpoint();recipe.pieces.splice(i,1,...pieces);update(false,pieces[Math.floor(pieces.length/2)]);clink('spread');
  }});
};
undoAction.onclick=()=>{withArt([],undo);canvas.focus({preventScroll:true});};
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
  knife.classList.remove('pressing');knife.style.removeProperty('--paste-load');knife.style.removeProperty('--tilt');
  knife.dataset.tool=kind||'';knife.dataset.ingredient=food||'';
  const blade=$('#utensil'),load=$('#knife-load'),done=$('#put-down');
  done.hidden=!food;
  if(food){
    const useKnife=food==='cream'||pantry[food].paste;
    const tool=kind==='spread'?(useKnife?'Bıçağı':'Kaşığı'):kind==='sauce'?'Şişeyi':'Baharatı';
    done.querySelector('span').textContent=tool+' bırak';
    const asset=kind==='spread'?(useKnife?'knife':'serving-spoon'):kind==='sauce'?'bottle-'+food:food;
    blade.src=assetURL(asset);
    load.hidden=kind!=='spread';if(kind==='spread')load.src=assetURL('smear-'+food);
    selected=-1;showHandle();
    hint(kind==='sauce'?'Basılı tutarak sık, sürükleyerek gezdir.':kind==='spice'?'Dokunarak serp.':
      food==='menemen'?'Dokunarak bir kaşık koy, sürükleyerek paylaştır.':'Dokunarak koy, sürükleyerek yay.');
  }else hint('');
  for(const b of document.querySelectorAll('.food[aria-pressed]'))b.setAttribute('aria-pressed',String(b.dataset.food===food));
}
$('#put-down').onclick=()=>{if(gesture)return;chooseBrush(null);canvas.focus({preventScroll:true});};
function makePiece(food,x,z){return {food,x:round(x),z:round(z),a:0,dem:0,water:0};}
function releasePiece(p,previous=-1){
  if(pantry[p.food].bread||pantry[p.food].drink){p.x=clamp(p.x,-1.6,1.6);p.z=clamp(p.z,-1.6,1.6);}
  const support=board.support(p,recipe.pieces.length,previous);
  if(previous<0 && !support.stable){board.slip(p);hint('Kaydı!',1000);return;}
  if(previous<0 && recipe.pieces.length>=80){hint('Tabak dolu.');return;}
  checkpoint();if(previous>=0)recipe.pieces.splice(previous,1);
  if(support.stable){
    p.x=round(p.x);p.z=round(p.z);p.a=round(p.a);
    recipe.pieces.push(p);update(previous>=0,p);if(selected>=0)board.land(p);clink(p.food);hint('');
  }else{selected=-1;update(true);board.slip(p);clink('drop');}
}
function moveCoverHint(){hint('Üst parçayı yana çekip içini doldur.');}
function pickFood(id,x,z){
  if(!board||gesture)return;
  if(mode==='camera'){leaveCamera();return;}
  if(recipe.closed&&!pantry[id].drink){hint('Önce sandviçi aç.');return;}
  if(isTool(id)){chooseBrush(brush===id?null:id);return;}
  chooseBrush(null);
  if(x===undefined){
    if(pantry[id].bread){x=0;z=0;}
    else if(pantry[id].drink){
      const spot=board.drinkSpot(id);
      if(!spot){hint('İçeceği raftan sofraya sürükle.');return;}
      ({x,z}=spot);
    }
    else{
      const spot=board.landingSpot(recipe.pieces.length);
      if(!spot){moveCoverHint();return;}
      ({x,z}=spot);
    }
    if(board.covers(x,z)){moveCoverHint();return;}
  }
  if(recipe.coverRemoved&&pantry[id].bread===recipe.bread){
    checkpoint();editBread(recipe,'placeTop',{x,z,yaw:0});
    selected=coverSelection;update();clink(id);return;
  }
  const piece=makePiece(id,x,z);releasePiece(piece);
  if(recipe.pieces.includes(piece)&&pantry[id].opening)hint(id==='ayran'?'Kapağı soymak için ayrana dokun.':'Pipeti takmak için kutuya dokun.');
}
function shelfPoint(x,y){
  const b=stage.getBoundingClientRect();return board.pick(b.left+x,b.top+y)||board.xy(b.left+x,b.top+y);
}
function dropFood(food,x,y){
  if(!board||gesture)return;
  const box=stage.getBoundingClientRect();
  if(mode==='edit'&&board.pickCover(box.left+x,box.top+y)){moveCoverHint();return;}
  if(isTool(food)&&!recipe.closed&&mode==='edit'){
    const hit=board.pick(box.left+x,box.top+y,false);
    const target=hit&&recipe.pieces[hit.i];
    withArt(foodArt(food),()=>{
      if(recipe.closed)return;
      chooseBrush(food);
      if(!hit||(!target&&recipe.baseRemoved))return;
      if(target){hit.i=recipe.pieces.indexOf(target);if(hit.i<0)return;}
      if(edible(hit))placeServing(hit);
    });
  }else{
    // Keep the release point in table coordinates while a cold ingredient decodes.
    const point=shelfPoint(x,y);
    withArt(foodArt(food),()=>pickFood(food,point.x,point.z));
  }
}
const resetShelf=mountShelf(stage,
  food=>withArt(foodArt(food),()=>pickFood(food)),dropFood,ingredients,(food,x,y)=>{
  if(!board||mode!=='edit')return;
  if(food&&recipe.closed&&!pantry[food].drink){board.lift(null);return false;}
  if(food&&pantry[food].kind==='topping'){
    const box=stage.getBoundingClientRect();
    if(board.pickCover(box.left+x,box.top+y)){board.lift(null);return false;}
    const loading=prepareArt(foodArt(food));
    if(loading){loading.catch(()=>{});board.lift(null);return false;}
    const p=shelfPoint(x,y);board.lift(makePiece(food,p.x,p.z));
  }else {board.lift(null);return !food;}
});
function warmShelf(event){
  const id=event.target.closest('[data-food]')?.dataset.food;
  if(id)prepareArt(foodArt(id))?.catch(()=>{});
}
for(const event of ['pointerover','focusin','pointerdown'])$('#foods').addEventListener(event,warmShelf);
function moveKnife(e){
  const paste=pantry[brush]?.paste;
  if(!brush||mode!=='edit'||(e.pointerType==='touch'&&!(paste&&gesture?.kind==='ink'))){knife.hidden=true;return;}
  const r=stage.getBoundingClientRect();
  if(gesture?.lastScreen){
    const dx=e.clientX-gesture.lastScreen[0],dy=e.clientY-gesture.lastScreen[1];
    if(Math.hypot(dx,dy)>1){
      const tilt=paste?-18+Math.atan2(dy,Math.abs(dx)+1)*22:clamp(-14+dy*.6-dx*.14,-33,12);
      knife.style.setProperty('--tilt',tilt+'deg');
    }
  }
  if(gesture?.kind==='ink')gesture.lastScreen=[e.clientX,e.clientY];
  knife.style.left=(e.clientX-r.left)+'px';knife.style.top=(e.clientY-r.top)+'px';knife.hidden=false;
}
function edible(hit){return hit&&!pantry[recipe.pieces[hit.i]?.food]?.drink;}
function newMark(hit){
  const marks=hit.i===-1?recipe.strokes:(recipe.pieces[hit.i].marks||=[]);
  const mark={food:brush,line:[]};marks.push(mark);return mark;
}
function markPoint(hit){return [Math.round(clamp(hit.u,0,1)*1024),Math.round(clamp(hit.v,0,1)*1024)];}
function placeServing(hit){
  if(countMarks()>=200){hint('Tabak dolu.');return;}
  selected=hit.i<0?breadSelection:hit.i;checkpoint();newMark(hit).line.push(markPoint(hit));update();clink('spread');hint('');
}
let paintFrame=0;
function refreshInk(){
  if(!paintFrame)paintFrame=requestAnimationFrame(()=>{paintFrame=0;board.paintBread(recipe.strokes);});
}
function inkPoint(hit){
  if(!edible(hit)){gesture.stroke=null;gesture.last=null;return;}
  const last=gesture.last;
  if(gesture.stroke&&last?.i===hit.i&&Math.hypot(last.x-hit.x,last.z-hit.z)<.003)return;
  const paste=pantry[brush].paste;
  if(paste&&last?.i===hit.i)gesture.distance+=Math.hypot(last.x-hit.x,last.z-hit.z);
  if(!gesture.stroke||last?.i!==hit.i||gesture.stroke.line.length>=150){
    if(countMarks()>=200)return;
    gesture.stroke=newMark(hit);
    if(paste)gesture.stroke.load=round(Math.max(.12,pasteRemaining(brush,gesture.distance)));
  }
  gesture.stroke.line.push(markPoint(hit));gesture.last=hit;gesture.surface=hit.i<0?breadSelection:hit.i;refreshInk();
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
  if(e.button===0){
    const anchor=board.pickCover(e.clientX,e.clientY);
    if(anchor){
      if(mode==='edit'){chooseBrush(null);selected=coverSelection;}
      gesture={kind:'cover-move',id:e.pointerId,anchor,px:e.clientX,py:e.clientY,moved:false};
      canvas.dataset.cursor='held';hint('');showHandle();return;
    }
  }
  const hit=mode==='edit'&&board.pick(e.clientX,e.clientY,!brush);
  if(mode==='camera'||(recipe.closed&&!movablePiece(hit?.i))||e.button===2||!hit){
    gesture={kind:'orbit',id:e.pointerId,px:e.clientX,py:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.dataset.cursor='held';knife.hidden=true;return;
  }
  if(brush){
    if(!edible(hit)||countMarks()>=200){hint(edible(hit)?'Tabak dolu.':'Ekmeğe veya bir malzemeye dokun.');return;}
    gesture={kind:'ink',before:JSON.stringify(recipe),id:e.pointerId,stroke:null,last:null,distance:0,px:e.clientX,py:e.clientY,start:performance.now(),moved:false};
    knife.classList.toggle('pressing',!!pantry[brush].paste);
    moveKnife(e);inkPoint(hit);if(pantry[brush].kind==='sauce')growBead(gesture);
    clink('spread');hint('');return;
  }
  if(!hit||hit.i<0){selected=hit?breadSelection:-1;showHandle();return;}
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
  if(!gesture&&board.pickCover(e.clientX,e.clientY)){
    knife.hidden=true;canvas.dataset.cursor='cover';return;
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
    for(let k=1;k<=steps;k++){
      const x=g.px+dx*k/steps,y=g.py+dy*k/steps;
      inkPoint(board.pickCover(x,y)?null:board.pick(x,y,false));
    }
    if(pantry[brush].paste)knife.style.setProperty('--paste-load',Math.max(.12,pasteRemaining(brush,g.distance)));
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
  const outcome=finishGesture(gesture,'canvas',e);if(!outcome)return;
  const g=gesture;gesture=null;queueMicrotask(drainArt);canvas.dataset.cursor=pantry[brush]?.kind||'';
  if(g.kind==='cover-move'&&g.moved){
    if(outcome==='commit')keepCover();else board.restoreCover();
  }
  if(g.kind==='orbit'&&!g.moved&&outcome==='commit'&&mode==='edit'){chooseBrush(null);selected=-1;}
  if(g.kind==='ink'){
    knife.classList.remove('pressing');knife.style.removeProperty('--paste-load');
    cancelAnimationFrame(g.holdFrame);cancelAnimationFrame(paintFrame);paintFrame=0;
    if(outcome==='commit'){checkpoint(g.before,g.surface);selected=g.surface;}
    else recipe=JSON.parse(g.before);
    update();
    if(e.pointerType==='touch')knife.hidden=true;
  }else if(g.kind==='piece'){
    board.lift(null);
    if(outcome==='commit'&&g.moved){
      if(board.pickCover(e.clientX,e.clientY))moveCoverHint();else releasePiece(g.next,g.i);
    }
    else if(outcome==='commit')openDrink();
  }
  showHandle();
}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('dblclick',e=>{
  if(!board)return;
  if(mode==='camera'){if(!board.pickCover(e.clientX,e.clientY))camera('tilt');return;}
  if(!board.pickCover(e.clientX,e.clientY)&&!board.pick(e.clientX,e.clientY)){board.resetOrbit(true);showHandle();}
});
canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointermove',move);
canvas.addEventListener('pointerup',ended);canvas.addEventListener('pointercancel',ended);
canvas.addEventListener('lostpointercapture',ended);
canvas.addEventListener('pointerleave',()=>knife.hidden=true);
function angleAt(e,p){const q=board.xy(e.clientX,e.clientY,board.handle(selected)?.height||0);return Math.atan2(q.z-p.z,q.x-p.x);}
function coverAngle(e,pose,height){
  const q=board.coverPlanePoint(e.clientX,e.clientY,height);
  if(!q||Math.hypot(q.x-pose.x,q.z-pose.z)<.015)return null;
  return Math.atan2(q.z-pose.z,q.x-pose.x);
}
function twistCover(delta,fromWheel=false){
  const pose=board.coverPose();if(!pose)return;
  board.adjustCover({...pose,yaw:pose.yaw+delta});keepCover(fromWheel);hint('');
}
turn.onpointerdown=e=>{
  if(gesture||e.button!==0)return;
  if(mode==='camera'||selected===coverSelection){
    const pose=board.coverPose();if(!pose)return;
    const height=board.coverHandle().height,start=coverAngle(e,pose,height);
    if(start===null)return;
    turn.setPointerCapture(e.pointerId);hint('');
    gesture={kind:'cover-turn',id:e.pointerId,pose,height,start,px:e.clientX,py:e.clientY,moved:false};return;
  }
  const p=recipe.pieces[selected];if(!p)return;
  turn.setPointerCapture(e.pointerId);gesture={kind:'turn',id:e.pointerId,a:p.a,start:angleAt(e,p),old:JSON.stringify(recipe)};
};
// A handle can receive several moves before the display can present one.
let turnFrame=0,pendingTurn=null;
function flushTurn(){
  if(turnFrame)cancelAnimationFrame(turnFrame);
  turnFrame=0;
  const e=pendingTurn;pendingTurn=null;if(!e)return;
  if(gesture?.kind==='cover-turn'&&e.pointerId===gesture.id){
    const g=gesture;
    if(!g.moved&&Math.hypot(e.clientX-g.px,e.clientY-g.py)<2)return;
    const next=coverAngle(e,g.pose,g.height);if(next===null)return;
    g.moved=true;board.adjustCover({...g.pose,yaw:g.pose.yaw+g.start-next});showHandle();return;
  }
  if(gesture?.kind!=='turn'||e.pointerId!==gesture.id)return;
  const p=recipe.pieces[selected];p.a=round(gesture.a+gesture.start-angleAt(e,p));board.sync(recipe,false,false);
  const h=board.handle(selected);turn.style.left=h.x+'px';turn.style.top=h.y+'px';
}
turn.onpointermove=e=>{
  if(!gesture||e.pointerId!==gesture.id)return;
  pendingTurn=e;if(!turnFrame)turnFrame=requestAnimationFrame(flushTurn);
};
turn.onpointerup=turn.onpointercancel=turn.onlostpointercapture=e=>{
  const outcome=finishGesture(gesture,'handle',e);if(!outcome)return;
  if(outcome==='cancel')pendingTurn=null;
  flushTurn();queueMicrotask(drainArt);
  if(gesture.kind==='cover-turn'){
    const moved=gesture.moved;gesture=null;
    if(outcome==='cancel'){board.restoreCover();showHandle();}
    else if(moved)keepCover();else twistCover(Math.PI/12);
    return;
  }
  const g=gesture;gesture=null;
  if(outcome==='cancel')recipe.pieces[selected].a=g.a;
  else{if(Math.abs(recipe.pieces[selected].a-g.a)<.01)recipe.pieces[selected].a+=Math.PI/12;recipe.pieces[selected].a=round(recipe.pieces[selected].a%(Math.PI*2));checkpoint(g.old);}
  update();
};
turn.onclick=e=>{
  if(mode==='camera'||selected===coverSelection){if(e.detail===0)twistCover(Math.PI/12);return;}
  if(e.detail!==0||selected<0)return;
  checkpoint();recipe.pieces[selected].a=round((recipe.pieces[selected].a+Math.PI/12)%(2*Math.PI));update();
};
canvas.addEventListener('wheel',e=>{
  if(!board||gesture||e.ctrlKey||!e.deltaY)return;
  if(board.pickCover(e.clientX,e.clientY)){
    e.preventDefault();
    if(mode==='edit'){chooseBrush(null);selected=coverSelection;}
    const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);
    twistCover(clamp(pixels*.002,-Math.PI/8,Math.PI/8),true);return;
  }
  if(mode==='camera')return;
  const i=board.pick(e.clientX,e.clientY)?.i??-1;if(!movablePiece(i))return;
  e.preventDefault();selected=i;const piece=recipe.pieces[i];checkpointWheel(piece);
  piece.a=round((piece.a+Math.sign(e.deltaY)*.14)%(2*Math.PI));update();
},{passive:false});
function dialog(title,html,photoDialog=false){
  if(!photoDialog)photos.send('dismiss');
  endService();
  $('#sheet-content').innerHTML='<div class="dialog-head"><h2 id="dialog-title">'+title+'</h2><button class="close" aria-label="Kapat">×</button></div>'+html;
  sheet.setAttribute('aria-labelledby','dialog-title');if(!sheet.open)sheet.showModal();
  $('.close').onclick=()=>sheet.close();
}
function endService(){cancelAnimationFrame(teaFrame);drinkService?.close();drinkService=null;}
sheet.addEventListener('close',()=>{if(!sheet.open){endService();if(photos.state!=='encoding'&&photos.state!=='idle')photos.send('dismiss');}});
sheet.addEventListener('click',e=>{if(e.target===sheet)sheet.close();});
$('#help').onclick=()=>dialog('Nasıl oynanır?','<ul><li>Malzemeyi raftan alıp ekmeğin üstüne veya tabağa bırak. Seçili malzemeyi yuvarlak tutamaçla döndür, Kaldır düğmesiyle kaldır.</li><li>Sivri biberi Aynala ile ters çevir. Biberi veya zeytini seçip Dilimle ile halkalara kes. Dilimlerde Kalınlık ile inceliği ayarla.</li><li>Sofradaki içeceğe dokun. Çayı doldur, ayranın folyosunu soy veya kutuya pipet tak.</li><li>Kâseyi seç. Tek dokunuş bir porsiyon koyar. Kaymağı ve salçaları bıçakla yay, reçel ve menemeni kaşıkla gezdir. Ketçap ve mayonez için basılı tutarak bir damla sık veya sürükleyerek ince bir şerit çiz. Aleti bırakmak için × düğmesine dokun.</li><li>Sofranın boş bir yerini sürükleyerek etrafında dön. Fareyle sağ tuşu da kullanabilirsin. Boş bir yere çift dokununca tepeden bakarsın.</li><li>Alt ekmeği seçip Kaldır’a dokun. Ekmek menüsünden de alt parçayı kaldırabilir veya geri koyabilirsin. Üst parça tabağın yanında başlar. Raftaki son dört ekmek yarısını da tabağa sürükleyebilirsin. Sofrada ve Foto’da üst parçayı sürükle, ⟳ tutamacıyla döndür. Sofradan almak için üst parçayı seçip Kaldır’a dokun. Kamerayı çevirmek için sofrayı sürükle. Foto’ya tekrar basınca çekersin.</li></ul><p>Klavye ile rafta okları ve Enter’ı kullan. Tabakta [ ve ] ile seç, oklarla taşı, R ile döndür, Delete ile kaldır. Foto’da ⟳ odaktayken oklarla üst parçayı taşı. R ve Shift+R ile ince döndür. Sofra odaktayken oklar kamerayı çevirir. Kaldır ile bir sürmeyi veya malzemenin tamamını seç. Geri al veya Ctrl/⌘ Z, son düzenlemeyi geri alır.</p>'+musicCredits());
function startBreakfast(id,cloth,random=false){
  artQueue.length=0;
  const next=emptyRecipe(id,cloth),foods=[];
  if(random){
    const solids=ingredients.filter(f=>f.kind==='topping'&&!f.drink&&!f.bread),count=3+Math.floor(Math.random()*6);
    for(let i=0;i<count;i++)foods.push(solids[Math.floor(Math.random()*solids.length)].id);
  }
  withArt([...recipeArt(next),...foods.flatMap(foodArt)],()=>{
    checkpoint();recipe=next;selected=-1;chooseBrush(null);
    if(random){
      board.sync(recipe);
      foods.forEach((food,i)=>{
        const pos=board.landingSpot(i);
        recipe.pieces.push({...makePiece(food,pos.x,pos.z),a:round(Math.random()*6.28)});
      });
    }
    if(sheet.open)sheet.close();
    if(mode==='camera')leaveCamera();
    board.resetOrbit();update();hint(random?'':'Üst parçayı tutup taşıyabilirsin.');
  });
}
$('#grand-reset').onclick=()=>{
  if(!board||gesture)return;
  board.lift(null);resetShelf();angle='tilt';
  startBreakfast('simit','kareli');
  canvas.focus({preventScroll:true});
};
$('#fresh').onclick=()=>{
  if(gesture)return;
  const options=Object.entries(breads).map(([id,b])=>'<button data-bread="'+id+'" '+(id==='simit'?'id="plain"':'')+'><img alt="" src="'+assetURL(b.asset)+'"><span>'+b.name+'</span></button>').join('');
  const restore=recipe.coverRemoved?'<button id="restore-cover">Üst parçayı geri koy</button>':'';
  const baseAction='<button id="toggle-base">'+(recipe.baseRemoved?'Alt parçayı geri koy':'Alt parçayı kaldır')+'</button>';
  const hasBread=!recipe.baseRemoved||!recipe.coverRemoved||recipe.pieces.some(p=>pantry[p.food].bread);
  dialog('Ekmek seç','<div class="bread-options">'+options+'</div><div class="buttons"><button id="remove-breads"'+(hasBread?'':' disabled')+'>Tüm ekmekleri kaldır</button>'+baseAction+restore+'<button id="random">Rastgele hazırla</button><button id="undo">Geri al</button></div>');
  $('#remove-breads').onclick=()=>{
    sheet.close();if(mode==='camera')leaveCamera();
    checkpoint();editBread(recipe,'removeAll');
    selected=-1;chooseBrush(null);update();canvas.focus({preventScroll:true});
  };
  $('#toggle-base').onclick=()=>{
    sheet.close();if(mode==='camera')leaveCamera();toggleBase();
    canvas.focus({preventScroll:true});
  };
  if(restore)$('#restore-cover').onclick=()=>{
    checkpoint();editBread(recipe,'restoreTop');sheet.close();selected=coverSelection;chooseBrush(null);update();canvas.focus({preventScroll:true});
  };
  $('#undo').disabled=!historyStack.length;$('#undo').onclick=()=>{sheet.close();undo();};
  for(const b of $('.bread-options').children)b.onclick=()=>startBreakfast(b.dataset.bread,recipe.cloth);
  $('#random').onclick=()=>startBreakfast(recipe.bread,recipe.cloth,true);
};
function openDrink(){
  const piece=recipe.pieces[selected];if(!piece)return;
  if(piece.food==='cay'){openTea();return;}
  const {name,opening}=pantry[piece.food];if(!opening)return;
  dialog(opening==='lid'?'Ayran':name,serviceControls(opening));
  drinkService=serveDrink(sheet,board.drinkService(piece.food),opening,openingPercent(piece),percent=>{
    if(percent===openingPercent(piece))return;
    checkpoint();
    if(opening==='lid'){
      if(percent)piece.peel=percent;else delete piece.peel;
    }else piece.prepared=true;
    update();clink(opening==='lid'?'spread':'drop');
  });
}
function openTea(){
  const p=recipe.pieces[selected];if(!p||p.food!=='cay')return;
  dialog('Çay doldur','<canvas id="glass" width="480" height="285" aria-label="Çay bardağı"></canvas><div class="tea-tools"><button id="dem"><img src="'+assetURL('demlik')+'" alt="">Dem</button><button id="water"><img src="'+assetURL('kettle')+'" alt="">Sıcak su</button></div><p class="readout"></p><div class="buttons"><button id="drain">Boşalt</button><button id="remove-glass">Bardağı kaldır</button><button class="primary" id="serve">Servis et</button></div>');
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
    function frame(now){const t=clamp((now-start)/550,0,1);drawPour(ctx,{...p,type:'cay',angle:0},t<1?kind:null,t,1.15);if(kind&&t<1)teaFrame=requestAnimationFrame(frame);}
    frame(start);
  }
  for(const k of ['dem','water'])$('#'+k).onclick=()=>{if(p.dem+p.water>=10)return;checkpoint();p[k]++;update();show(k);clink('cay');};
  $('#remove-glass').onclick=()=>{sheet.close();removeSelected();canvas.focus({preventScroll:true});};
  $('#drain').onclick=()=>{checkpoint();p.dem=p.water=0;update();show();};$('#serve').onclick=()=>sheet.close();show();
}
function camera(a){
  if(gesture)return;
  photos.send('dismiss');mode='camera';angle=a;selected=-1;chooseBrush(null);hint('');showHandle();$('#game').classList.add('camera');
  $('#back').hidden=$('#views').hidden=$('#finder').hidden=false;
  showCoverChoice();
  for(const b of $('#views').children)b.setAttribute('aria-pressed',String(b.dataset.angle===a));
  board.setView(a);lidButton();showHandle();canvas.focus({preventScroll:true});coverHint();
}
function leaveCamera(){
  if(gesture)return;
  photos.send('dismiss');mode='edit';$('#game').classList.remove('camera');$('#back').hidden=$('#views').hidden=$('#finder').hidden=$('#cover-control').hidden=true;board.setView(null);showHandle();lidButton();hint('');
}
coverSelect.onchange=()=>{
  const choice=coverSelect.value;
  if(mode!=='camera'||recipe.coverRemoved||(choice!=='table'&&!Object.hasOwn(photoCovers,choice)))return;
  if(gesture){showCoverChoice();return;}
  checkpoint();
  if(choice==='table')delete recipe.photoCover;else recipe.photoCover=choice;
  board.refreshCover();showHandle();save();coverHint();
};
for(const [id,name] of Object.entries(cameraNames)){
  const btn=document.createElement('button');btn.dataset.angle=id;btn.textContent=name;btn.onclick=()=>camera(id);$('#views').append(btn);
}
$('#back').onclick=leaveCamera;
function toBlob(canvas,type,quality){return new Promise((res,rej)=>canvas.toBlob(blob=>blob?res(blob):rej(Error('Photo export failed')),type,quality));}
function fetchAlbum(action,record){albumDB ||= photoStore();return albumDB(action,record);}
function photoPreview(record,fromAlbum=false){
  if(snapshot)URL.revokeObjectURL(snapshot);snapshot=URL.createObjectURL(record.blob);
  dialog(record.id?'Sofra № '+record.id:'Fotoğraf','<img class="print" alt="Simit fotoğrafı"><div class="buttons">'+(fromAlbum?'<button id="remix" class="primary">Sofraya ekle</button>':'<button id="keep" class="primary">Sakla</button>')+'<a id="png" download="sofra.png">İndir</a><button id="share">Bağlantı</button><button id="hang">Panoya as</button></div><p class="feedback" role="status"></p>',true);
  $('.print').src=snapshot;$('#png').href=snapshot;
  const feedback=$('.feedback'),hang=$('#hang');
  hang.onclick=()=>{if(photos.send('compose'))publishPhoto(record,fromAlbum);};
  if(!fromAlbum)$('#keep').onclick=async()=>{
    const visit=photos.send('save');if(!visit)return;
    const button=$('#keep');button.disabled=hang.disabled=true;
    try{record.id=await fetchAlbum('keep',record);if(sheet.open&&photos.send('saved',visit))photoPreview(record,true);}
    catch{if(!sheet.open||!photos.send('failed',visit))return;button.disabled=hang.disabled=false;feedback.textContent='Albüm kaydedilemedi. Fotoğrafı indirebilirsin.';}
  };
  if(fromAlbum)$('#remix').onclick=()=>{
    const next=readRecipe(record.recipe)||emptyRecipe();
    withArt(recipeArt(next),()=>{checkpoint();recipe=next;selected=-1;chooseBrush(null);sheet.close();leaveCamera();update();});
  };
  $('#share').onclick=async()=>{
    const link=recipeURL(record.recipe);
    try{await navigator.clipboard.writeText(link);feedback.textContent='Bağlantı kopyalandı.';}
    catch{const input=document.createElement('input');input.readOnly=true;input.value=link;feedback.replaceChildren(input);if(feedback.isConnected&&sheet.open)input.select();}
  };
}
function publishPhoto(record,fromAlbum){
  dialog('Panoya as','<form id="hang-form"><img class="print" alt="Asılacak sofra"><label>Tarif adı<input id="hang-title" maxlength="48" required autocomplete="off"></label><p>Tarifin herkese açık olur. Diğer oyuncular oy verebilir ve bir kopyasını hazırlayabilir.</p><div class="buttons"><button type="submit" class="primary">Panoya as</button><button type="button" id="hang-back">Geri</button></div><p class="feedback" role="status"></p></form>',true);
  $('.print').src=snapshot;
  const form=$('#hang-form'),name=$('#hang-title'),submit=form.querySelector('[type=submit]'),feedback=form.querySelector('.feedback');
  name.value=record.recipe.baseRemoved?'Kahvaltı tabağım':breads[record.recipe.bread||'simit'].name+' sofram';
  $('#hang-back').onclick=()=>{if(photos.send('back'))photoPreview(record,fromAlbum);};
  form.onsubmit=async event=>{
    event.preventDefault();const visit=photos.send('publish');if(!visit)return;
    submit.disabled=true;feedback.textContent='Asılıyor…';
    try{
      const {recipe,angle,pose,frame}=record;
      const result=await boardWrite('',{title:name.value,recipe,angle,pose,frame});
      if(!sheet.open||!photos.send('published',visit))return;
      dialog(result.created?'Tarifin panoda':'Bu tarif zaten panoda','<div class="buttons"><a id="see-post" class="primary">Panoda gör</a><button id="copy-post">Bağlantıyı kopyala</button><button id="copy-removal">Özel kaldırma bağlantısı</button></div><p class="feedback" role="status"></p>',true);
      const status=$('.feedback');
      const url=publicURL(result.id);$('#see-post').href=url;
      function copy(link,message){return async()=>{try{await navigator.clipboard.writeText(link);status.textContent=message;}catch{status.textContent=link;}};}
      $('#copy-post').onclick=copy(url,'Bağlantı kopyalandı.');
      $('#copy-removal').onclick=copy(url+'#kaldir='+result.removeKey,'Özel bağlantı kopyalandı. Bu bağlantıyı sakla; yalnızca tarifi kaldırmak için kullanılır.');
    }catch(error){if(sheet.open&&photos.send('failed',visit)){feedback.textContent=error.message;submit.disabled=false;}}
  };
}
$('#shutter').onclick=async()=>{
  if(!board||gesture)return;
  if(mode==='edit'){camera(board.hasEditPose()?'free':'tilt');return;}
  const visit=photos.send('capture');if(!visit)return;
  try{
    const output=board.capture(),record={recipe:structuredClone(recipe),angle,pose:board.pose(),frame:board.frame(),date:Date.now()};
    record.blob=await toBlob(output,'image/png');
    if(photos.visit!==visit)return;
    const thumb=document.createElement('canvas');thumb.width=thumb.height=128;
    thumb.getContext('2d').drawImage(output,0,0,128,128);record.thumb=thumb.toDataURL('image/webp',.72);
    if(photos.send('encoded',visit))photoPreview(record);
  }catch{
    if(photos.send('failed',visit))hint('Fotoğraf çekilemedi. Tekrar dene.');
  }
};
$('#album').onclick=async()=>{
  dialog('Albümüm','<div class="gallery"></div><p class="feedback"></p>');
  const gallery=$('.gallery');
  try{
    const records=await fetchAlbum('list');if(!gallery.isConnected)return;
    if(!records.length)$('.feedback').textContent='İlk fotoğrafını çek ve Sakla’ya bas.';
    for(const r of records.reverse()){
      const b=document.createElement('button'),img=new Image();img.src=r.thumb;img.alt='Sofra '+r.id;
      const label=document.createElement('small');label.textContent='№ '+r.id;b.append(img,label);b.onclick=()=>{if(photos.send('albumPhoto'))photoPreview(r,true);};gallery.append(b);
    }
  }catch{if(gallery.isConnected)$('.feedback').textContent='Bu tarayıcıda albüm kullanılamıyor.';}
  if(read('sofra.table.v1') && gallery.isConnected){const p=document.createElement('p'),a=document.createElement('a');a.href='./table.html';a.textContent='Önceki kahvaltı masam';p.append(a);$('#sheet-content').append(p);}
};
document.addEventListener('keydown',e=>{
  if(artQueue.length&&!sheet.open&&(e.target===canvas||e.target===turn)){
    if(e.key==='Escape')artQueue.length=0;
    else if(['Enter','Delete','Backspace','[',']','r','R','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z')){
      e.preventDefault();withArt([],()=>editKey(e));return;
    }
  }
  editKey(e);
});
function editKey(e){
  if(sheet.open||!board||gesture||e.target===coverSelect||e.target.closest?.('#radio'))return;
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo();return;}
  if(e.key==='Escape'){if(mode==='camera')leaveCamera();else{chooseBrush(null);selected=-1;showHandle();}return;}
  if(mode==='edit'&&e.target===canvas&&['[',']'].includes(e.key)){
    const choices=recipe.pieces.map((_,i)=>i).filter(movablePiece);
    if(!recipe.coverRemoved)choices.push(coverSelection);
    if(!recipe.baseRemoved&&!recipe.closed)choices.push(breadSelection);
    if(!choices.length)return;
    const i=choices.indexOf(selected),step=e.key==='['?-1:1;
    selected=choices[i<0?(step<0?choices.length-1:0):(i+step+choices.length)%choices.length];
    chooseBrush(null);showHandle();return;
  }
  if(mode==='edit'&&(e.target===canvas||e.target===turn)&&['Delete','Backspace'].includes(e.key)){
    e.preventDefault();removeSelected();canvas.focus({preventScroll:true});return;
  }
  if(mode==='camera'||(selected===coverSelection&&(e.target===canvas||e.target===turn))){
    const dirs={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-16],ArrowDown:[0,16]};
    if(e.key.toLowerCase()==='r'&&!e.metaKey&&!e.ctrlKey&&board.coverPose()){
      e.preventDefault();twistCover((e.shiftKey?-1:1)*Math.PI/90);return;
    }
    if((mode==='edit'||e.target===turn)&&dirs[e.key]){
      e.preventDefault();
      const pose=board.coverPose(),yaw=board.pose().yaw,[right,down]=dirs[e.key].map(Math.sign);
      board.adjustCover({...pose,x:pose.x+.015*(right*Math.cos(yaw)+down*Math.sin(yaw)),
        z:pose.z+.015*(down*Math.cos(yaw)-right*Math.sin(yaw))});keepCover();return;
    }
    if(dirs[e.key]){e.preventDefault();freeRotate(...dirs[e.key]);}
    return;
  }

  if(e.target!==canvas||(recipe.closed&&!movablePiece(selected)))return;
  if(brush&&['Enter',' '].includes(e.key)){
    e.preventDefault();const hit=board.servingSpot(countMarks());
    if(hit)placeServing(hit);else hint('Önce tabağa bir malzeme koy.');return;
  }
  const p=recipe.pieces[selected];if(!p)return;
  if(e.key==='Enter'&&(p.food==='cay'||pantry[p.food].opening)){e.preventDefault();openDrink();return;}
  const dirs={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]};
  if(dirs[e.key]){e.preventDefault();const [dx,dz]=dirs[e.key];releasePiece({...p,x:p.x+dx,z:p.z+dz},selected);}
  if(e.key.toLowerCase()==='r'){checkpoint();p.a=round((p.a+.15)%(2*Math.PI));update();}
}
new ResizeObserver(()=>requestAnimationFrame(showHandle)).observe(stage);
window.render_game_to_text=()=>JSON.stringify({ready:!!board,mode,photo:photos.state,gesture:gesture?.kind??null,angle,selected,brush,music:music.state(),camera:board?.pose(),drinkService:drinkService?.state()??null,coordinates:'x right, z down, one unit is the bread width',...recipe,photoCover:photoCoverFor(recipe),visibleCoverPose:board?.coverPose()});
window.advanceTime=ms=>board?.step(ms);
function openSharedLink(){
  if(!board)return;
  const shared=recipeFromHash(location.hash);
  if(!shared)return;
  // A link opened during another interaction gets the normal fresh-page preview.
  if(gesture||mode==='camera'||(sheet.open&&!$('#shared-print'))){location.reload();return;}
  const hash=location.hash;
  withArt(recipeArt(shared),()=>{if(location.hash===hash)previewShared(shared);});
}
function previewShared(shared){
  history.replaceState(null,'',location.pathname+location.search);
  let print;
  try{
    board.sync(shared);board.setView('tilt');print=board.capture(480);
  }finally{
    board.setView(null);board.sync(recipe);showHandle();
  }
  dialog('Paylaşılan sofra','<div id="shared-print"></div><div class="buttons"><button id="import-recipe" class="primary">Sofraya ekle</button><button id="keep-draft">Soframda kal</button></div>');
  print.className='print';$('#shared-print').append(print);
  $('#keep-draft').onclick=()=>sheet.close();
  $('#import-recipe').onclick=()=>{checkpoint();recipe=shared;selected=-1;chooseBrush(null);sheet.close();update();};
}
window.addEventListener('hashchange',openSharedLink);
try{
  board=await createBoard(canvas,recipe);update();$('#shutter').disabled=$('#grand-reset').disabled=false;
  hint(recipe.coverRemoved||recipe.pieces.length||recipe.strokes.length?'':'Üst parçayı tutup taşıyabilirsin.',3600);
  openSharedLink();drainArt();
}catch(err){console.error(err);hint('Sofra açılamadı. WebGL destekli bir tarayıcıda yenile.',0);}
