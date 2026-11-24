import { catalog, clamp, limit, makeDish, starter, readTable, encodeTable, decodeTable, teaName } from './model.js';
import { loadArt, boxFor, tablePoint, drawTable, drawPour } from './drawing.js?v=servings';

import { mountShelf } from './shelf.js';

const $ = s => document.querySelector(s);
const board = $('#board'), canvas = $('#table'), ctx = canvas.getContext('2d');
const hitLayer = $('#hit-layer'), dialog = $('#dialog'), body = $('#dialog-body');
const icons = {
  camera:'<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="3.5"/>',
  mute:'<path d="M11 5 6 9H3v6h3l5 4zM16 9l5 6m0-6-5 6"/>',
  sound:'<path d="M11 5 6 9H3v6h3l5 4zM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.4 9a2.7 2.7 0 1 1 4.7 1.8c-1.5 1.3-2.1 1.5-2.1 3.1m0 3h.01"/>',
  undo:'<path d="m9 5-5 5 5 5M5 10h9a5 5 0 0 1 0 10"/>',
  reset:'<path d="M4 11a8 8 0 1 1 2 6m-2-6V5m0 6h6"/>',
  more:'<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></g>',
  left:'<path d="m14 6-6 6 6 6"/>',
  right:'<path d="m10 6 6 6-6 6"/>',
  remove:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  link:'<path d="m9 15 6-6m-4 0 2-2a4 4 0 0 1 6 6l-2 2m-4 0-2 2a4 4 0 0 1-6-6l2-2"/>'
};
function decorate(root=document) {
  root.querySelectorAll('i[data-icon]').forEach(node=>{
    node.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icons[node.dataset.icon]+'</svg>';
  });
}
const storageKey='sofra.table.v1';
function readLocal(key) { try{return localStorage.getItem(key);}catch{return null;} }
function writeLocal(key,value) { try{localStorage.setItem(key,value);}catch{/* A private session can still play. */} }
function restore() { try{return readTable(JSON.parse(readLocal(storageKey)));}catch{return null;} }
const shared=decodeTable(location.hash);
let table=shared || restore() || starter();
let selected=-1, sound=readLocal('sofra.sound')==='on', audio;
let drag=null, ready=false, view='table', pour=null, animationId=0;
const undoStack=[];
if(shared){writeLocal(storageKey,JSON.stringify(table));history.replaceState(null,'',location.pathname+location.search);}
const save=()=>writeLocal(storageKey,JSON.stringify(table));
let noticeTimer;
function notify(text) {
  const node=$('#notice');node.textContent=text;node.classList.add('show');clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>node.classList.remove('show'),2100);
}
function checkpoint() {undoStack.push(JSON.stringify(table));if(undoStack.length>40)undoStack.shift();}
function clink(kind='clink') {
  if(!sound)return;
  try {
    audio ||= new AudioContext();void audio.resume().catch(()=>{});
    const oscillator=audio.createOscillator(),gain=audio.createGain();
    const when=audio.currentTime, frequency=kind==='bread'?260:kind==='tea'?710:1510;
    oscillator.type=kind==='bread'?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency,when);
    oscillator.frequency.exponentialRampToValueAtTime(frequency*.72,when+.10);
    gain.gain.setValueAtTime(.055,when);gain.gain.exponentialRampToValueAtTime(.0001,when+.19);
    oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(when+.2);
  } catch { /* Audio is optional. */ }
}
function rect() {return board.getBoundingClientRect();}
function sizeCanvas() {
  const {width,height}=rect();const dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);paint();positionHits();positionContext();
}
function paint(){if(ready){const r=rect();drawTable(ctx,r.width,r.height,table,drag?.moved?drag.i:-1);}}
function positionHits() {
  const {width,height}=rect();
  [...hitLayer.children].forEach((el,i)=>{
    const d=table.dishes[i];if(!d)return;
    const {x,y,size}=boxFor(d,width,height),diam=size*(d.part==='piece'?.37:.78);
    Object.assign(el.style,{left:x+'px',top:y+'px',width:diam+'px',height:diam+'px'});
    el.setAttribute('aria-pressed',String(selected===i));
  });
}
function rebuildHits(){
  hitLayer.replaceChildren(...table.dishes.map((d,i)=>{
    const b=document.createElement('button');b.className='dish-hit';b.dataset.idx=i;
    b.setAttribute('aria-label',catalog[d.type].name+(d.part==='piece'?' piece':'')+' on table '+(i+1));
    b.title=catalog[d.type].name;return b;
  }));positionHits();
}
function positionContext(){
  const line=$('#context'),d=table.dishes[selected];
  if(line.hidden || !d)return;
  const r=rect(),{x,y,size}=boxFor(d,r.width,r.height);
  const radius=size*(d.part==='piece'?.18:.40);
  const below=y+radius+5;
  const top=below+line.offsetHeight<r.height-8?below:y-radius-line.offsetHeight-5;
  line.style.left=clamp(x,line.offsetWidth/2+6,r.width-line.offsetWidth/2-6)+'px';
  line.style.top=Math.max(4,top)+'px';
}
function context(){
  const line=$('#context'),d=table.dishes[selected];
  line.hidden=!d || !!drag?.moved;
  if(line.hidden)return;
  const use=d.type==='cay'?'<button class="use" data-action="pour">Pour tea</button>':
    d.type==='simit'&&!d.part?'<button class="use" data-action="tear">Tear simit</button>':'';
  line.innerHTML=use+'<button data-action="rotate" aria-label="Rotate dish" title="Rotate"><i data-icon="reset"></i></button><button data-action="remove" aria-label="Remove dish" title="Remove"><i data-icon="remove"></i></button>';
  decorate(line);positionContext();
}
function refresh(rebuild=true) {
  if(rebuild)rebuildHits();else positionHits();
  document.querySelectorAll('[data-cloth]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cloth===table.cloth)));
  $('#undo').disabled=!undoStack.length;paint();context();
}
function change(action){checkpoint();action();save();refresh();}
function undo(){
  if(!undoStack.length)return;
  table=JSON.parse(undoStack.pop());selected=-1;save();refresh();notify('Last change undone');
}
function select(i){selected=i;positionHits();paint();context();}
function add(type,x,y){
  if(!Object.hasOwn(catalog,type))return;
  if(table.dishes.length>=limit){notify('The table is full. Remove a dish to make room.');return;}
  if(x===undefined){
    // Find a free patch of cloth before placing another dish over a neighbour.
    const r=rect();let best=-Infinity;
    for(const px of [.21,.38,.54,.70,.83])for(const py of [.23,.46,.68,.79]){
      const candidate=boxFor(makeDish(type,px,py),r.width,r.height);
      const gap=Math.min(...table.dishes.map(d=>{
        const b=boxFor(d,r.width,r.height);
        return Math.hypot(b.x-candidate.x,b.y-candidate.y)-b.size*.4;
      }));
      if(gap>best){best=gap;x=px;y=py;}
    }
  }
  change(()=>{table.dishes.push(makeDish(type,x,y));selected=-1;});
  clink();
}
function tear(){
  const d=table.dishes[selected];if(d?.type!=='simit'||d.part)return;
  if(table.dishes.length>=limit){notify('Make room for the torn piece first');return;}
  change(()=>{d.part='ring';const piece={...d,part:'piece',x:clamp(d.x+.13,.1,.9),y:clamp(d.y+.12,.1,.9),angle:d.angle+.32};selected=table.dishes.push(piece)-1;});
  clink('bread');notify('Simit torn');
}
function edit(action){
  const d=table.dishes[selected];if(!d)return;
  if(action==='pour'){openTea();return;}
  if(action==='tear'){tear();return;}
  if(action==='rotate')change(()=>{d.angle=(d.angle+Math.PI/6)%(Math.PI*2);});
  if(action==='remove')change(()=>{table.dishes.splice(selected,1);selected=-1;});
}
$('#context').onclick=e=>{const button=e.target.closest('[data-action]');if(button)edit(button.dataset.action);};
function dipIfNear(d){
  if(d.type!=='simit'||d.part!=='piece'||d.dipped)return;
  const r=rect(),piece=boxFor(d,r.width,r.height);
  if(table.dishes.some(other=>{
    if(other.type!=='kaymak')return false;
    const bowl=boxFor(other,r.width,r.height);
    return Math.hypot(bowl.x-piece.x,bowl.y-piece.y)<bowl.size*.48;
  })){d.dipped=true;notify('A little bal kaymak on your simit');}
}
board.addEventListener('pointerdown',e=>{
  const hit=e.target.closest('.dish-hit');
  if(!hit){select(-1);return;}
  if(drag||e.button!==0)return;
  const i=Number(hit.dataset.idx),r=rect(),d=table.dishes[i],b=boxFor(d,r.width,r.height);
  select(i);hit.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,i,startX:e.clientX,startY:e.clientY,offX:b.x-(e.clientX-r.left),offY:b.y-(e.clientY-r.top),moved:false,prior:JSON.stringify(table)};
});
board.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  if(!drag.moved && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4)return;
  drag.moved=true;const r=rect(),d=table.dishes[drag.i],b=boxFor(d,r.width,r.height);
  const x=clamp(e.clientX-r.left+drag.offX,b.size*.43,r.width-b.size*.43);
  const y=clamp(e.clientY-r.top+drag.offY,b.size*.43,r.height-b.size*.43);
  Object.assign(d,tablePoint(x,y,r.width,r.height));
  $('#context').hidden=true;paint();positionHits();
});
function endDrag(e){
  if(!drag||e.pointerId!==drag.id)return;
  const {moved,prior,i}=drag;drag=null;
  if(e.type==='pointercancel'){table=JSON.parse(prior);refresh();return;}
  if(moved){
    undoStack.push(prior);if(undoStack.length>40)undoStack.shift();
    const [d]=table.dishes.splice(i,1);table.dishes.push(d);selected=-1;dipIfNear(d);
    save();refresh();clink();return;
  }
  if(table.dishes[i]?.type==='cay')openTea();
}
board.addEventListener('pointerup',endDrag);board.addEventListener('pointercancel',endDrag);
hitLayer.addEventListener('click',e=>{
  // A screen reader or keyboard activation can arrive without a pointer sequence.
  const b=e.target.closest('.dish-hit');if(b&&e.detail===0){select(+b.dataset.idx);if(table.dishes[selected].type==='cay')openTea();}
});
hitLayer.addEventListener('keydown',e=>{
  const b=e.target.closest('.dish-hit');if(!b)return;const i=+b.dataset.idx;
  const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(directions[e.key]){
    e.preventDefault();selected=i;const r=rect(),d=table.dishes[i],bb=boxFor(d,r.width,r.height),[dx,dy]=directions[e.key];
    checkpoint();
    const nx=clamp(bb.x+dx*9,bb.size*.43,r.width-bb.size*.43);
    const ny=clamp(bb.y+dy*9,bb.size*.43,r.height-bb.size*.43);
    Object.assign(d,tablePoint(nx,ny,r.width,r.height));dipIfNear(d);save();refresh(false);
  }
  if(e.key==='Delete'){e.preventDefault();select(i);edit('remove');}
});
mountShelf(board,add,(type,x,y)=>{
  const r=rect(),point=tablePoint(x,y,r.width,r.height);
  add(type,point.x,point.y);
});
const menu=$('#menu');
document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))menu.open=false;});
menu.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('.cloths'))menu.open=false;},{capture:true});
$('.cloths').onclick=e=>{const cloth=e.target.dataset.cloth;if(cloth&&cloth!==table.cloth)change(()=>{table.cloth=cloth;});};
$('#undo').onclick=undo;
function soundLabel(){const b=$('#sound');b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label',sound?'Mute sound':'Enable sound');b.innerHTML='<i data-icon="'+(sound?'sound':'mute')+'"></i><span>Sound '+(sound?'on':'off')+'</span>';decorate(b);}
$('#sound').onclick=()=>{sound=!sound;writeLocal('sofra.sound',sound?'on':'off');soundLabel();clink();};
$('#help').setAttribute('aria-label','How to play');
function modal(mode,title,content) {
  view=mode;body.innerHTML='<div class="modal"><header><h2 id="modal-title">'+title+'</h2><button class="icon-button" id="close" aria-label="Close"><i data-icon="close"></i></button></header>'+content+'</div>';
  decorate(body);dialog.setAttribute('aria-labelledby','modal-title');if(!dialog.open)dialog.showModal();$('#close').onclick=()=>dialog.close();
}
dialog.addEventListener('close',()=>{view='table';cancelAnimationFrame(animationId);pour=null;paint();});
dialog.onclick=e=>{if(e.target===dialog)dialog.close();};
$('#help').onclick=()=>modal('help','How to play','<ul><li>Swipe the food strip sideways. Tap a food to add it, or pull it up onto the table.</li><li>Drag a dish to move it. Select one to rotate or remove it.</li><li>Tap the tea glass to pour. Select the simit to tear it, then drag the piece into bal kaymak.</li><li>Take a photo to download your breakfast or copy an editable table link.</li></ul><p>Keyboard: Tab to a dish, move with the arrow keys. Enter selects it. F toggles fullscreen.</p>');
$('#reset').onclick=()=>{
  modal('reset','Set a new table','<p>Start with the morning spread or an empty tray. You can undo this change.</p><div class="choice"><button class="secondary" id="empty">Empty tray</button><button class="primary" id="starter">Morning spread</button></div>');
  function replace(empty){change(()=>{table=starter();if(empty)table.dishes=[];selected=-1;});dialog.close();}
  $('#empty').onclick=()=>replace(true);$('#starter').onclick=()=>replace(false);
};
function teaFrame(){
  if(view!=='tea')return;
  const d=table.dishes[selected],c=$('#tea-canvas').getContext('2d');
  drawPour(c,d,pour?.kind,pour?pour.time/650:0);
}
function advance(ms){
  if(!pour)return;
  pour.time+=ms;if(pour.time>=650)pour=null;teaFrame();
}
function animatePour(kind){
  cancelAnimationFrame(animationId);pour={kind,time:0};
  let last=performance.now();teaFrame();
  function frame(now){advance(Math.max(0,now-last));last=now;if(pour)animationId=requestAnimationFrame(frame);}
  animationId=requestAnimationFrame(frame);
}
function teaInfo(){
  const d=table.dishes[selected],total=d.dem+d.water;
  $('#strength').textContent=teaName(d);$('#level').textContent=(total*10)+'% full';
  $('#dem').disabled=$('#water').disabled=total>=10;
  $('#empty-glass').disabled=total===0;
  $('#tea-feedback').textContent=total===10?'The glass is full.':(d.dem+' measure'+(d.dem===1?'':'s')+' of dem · '+d.water+' measure'+(d.water===1?'':'s')+' of water');
  teaFrame();
}
function openTea(){
  if(table.dishes[selected]?.type!=='cay')return;
  modal('tea','Çay doldur','<div class="tea-scene"><canvas id="tea-canvas" width="580" height="328" aria-label="Tea glass"></canvas></div><div class="tea-readout"><strong id="strength" lang="tr"></strong><span id="level"></span></div><p class="pour-help">Choose a pot to pour one measure.</p><div class="actions pots"><button class="secondary" id="dem"><img src="./assets/demlik.webp" alt="">Add dem</button><button class="secondary" id="water"><img src="./assets/kettle.webp" alt="">Add hot water</button></div><p class="feedback" id="tea-feedback" aria-live="polite"></p><div class="tea-footer"><button id="empty-glass" class="quiet">Empty glass</button><button class="primary" id="serve">Serve tea</button></div>');
  const d=table.dishes[selected];
  for(const [button,key] of [['#dem','dem'],['#water','water']])$(button).onclick=()=>{
    if(d.dem+d.water>=10)return;checkpoint();d[key]++;save();animatePour(key);teaInfo();refresh(false);clink('tea');
  };
  $('#empty-glass').onclick=()=>{checkpoint();d.dem=d.water=0;pour=null;save();teaInfo();refresh(false);};
  $('#serve').onclick=()=>{clink();dialog.close();};teaInfo();
}
function openPhoto(){
  if(!ready)return;
  const photo=document.createElement('canvas'),r=rect(),scale=1680/Math.max(r.width,r.height);
  const w=Math.round(r.width*scale),h=Math.round(r.height*scale);
  photo.width=w;photo.height=h+100;const c=photo.getContext('2d');
  drawTable(c,w,h,table);c.fillStyle='#faf6eb';c.fillRect(0,h,w,100);
  c.fillStyle='#963b2a';c.font='bold italic 54px Georgia';c.fillText('Sofra.',38,h+66);
  c.textAlign='right';c.fillStyle='#555449';c.font='25px Georgia';
  c.fillText('Kahvaltı sofrası   ·   '+new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'}).format(new Date()),w-38,h+60);
  const url=photo.toDataURL('image/png'),link=new URL(location.href);link.hash='sofra='+encodeTable(table);
  modal('photo','Sofra fotoğrafı','<img class="preview" id="preview" alt="Your arranged Turkish breakfast table"><div class="actions"><button id="share" class="secondary"><i data-icon="link"></i>Copy table link</button><a id="download" class="primary" download="sofra-kahvalti.png"><i data-icon="download"></i>Save photo</a></div><p class="feedback" id="share-feedback" aria-live="polite"></p>');
  $('#preview').src=url;$('#download').href=url;
  $('#share').onclick=async()=>{
    try{await navigator.clipboard.writeText(link.href);$('#share-feedback').textContent='Table link copied.';}
    catch{let field=$('.share-field');if(!field){field=document.createElement('input');field.className='share-field';field.readOnly=true;field.setAttribute('aria-label','Table link');$('#share-feedback').after(field);}field.value=link.href;field.select();$('#share-feedback').textContent='Copy the selected table link.';}
    if(['localhost','127.0.0.1'].includes(location.hostname))$('#share-feedback').textContent+=' This address opens on this computer.';
  };
}
$('#photo').onclick=openPhoto;
document.addEventListener('keydown',e=>{
  if(dialog.open)return;
  if(e.key.toLowerCase()==='f'&&!e.metaKey&&!e.ctrlKey&&!e.altKey){if(document.fullscreenElement)document.exitFullscreen?.()?.catch(()=>{});else document.documentElement.requestFullscreen?.()?.catch(()=>{});}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo();}
  if(e.key==='Escape'){if(menu.open){menu.open=false;menu.querySelector('summary').focus();}else select(-1);}
});
window.render_game_to_text=()=>JSON.stringify({view,ready,coordinates:'normalized, origin top left, +x right, +y down',selected,sound,...table});
window.advanceTime=ms=>{advance(ms);paint();};
decorate();soundLabel();refresh();new ResizeObserver(sizeCanvas).observe(board);
$('#photo').disabled=true;
try{await loadArt();ready=true;sizeCanvas();$('#photo').disabled=false;}catch{notify('The food artwork could not load. Reload to try again.');}
