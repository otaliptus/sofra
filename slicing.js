import { pantry, sliceThickness, wholeCuts } from './recipe.js?v=slices';

// Use the same cutouts as the playable pieces to show the cut spacing and edge.
export function chooseSlice(piece,room,{sheet,dialog,apply}){
  const cut=wholeCuts[piece.food],food=cut?.ring||piece.food;
  let thickness=piece.thickness||'regular',drag=null;
  const options=Object.entries(sliceThickness).map(([key,spec])=>'<button type="button" data-thickness="'+key+'">'+spec.name+'</button>').join('');
  dialog(pantry[piece.food].name,'<div class="cut-board"><canvas width="720" height="286" aria-hidden="true"></canvas></div>'+
    '<div class="cut-options" role="group" aria-label="Dilim kalınlığı">'+options+'</div>'+
    '<div class="cut-footer"><span role="status"></span><button class="cut-apply" type="button">'+(cut?'Kes':'Uygula')+'</button></div>');
  const board=sheet.querySelector('.cut-board'),canvas=board.firstElementChild,ctx=canvas.getContext('2d');
  const status=sheet.querySelector('.cut-footer span'),button=sheet.querySelector('.cut-apply');
  const image=id=>document.querySelector('[data-food="'+id+'"] img');
  const face=image(food),whole=image(piece.food);
  face.loading=whole.loading='eager';
  const edge=document.createElement('canvas');edge.width=220;edge.height=220;
  function draw(){
    if(!canvas.isConnected||!face.naturalWidth||!whole.naturalWidth)return;
    ctx.clearRect(0,0,720,286);
    if(cut){
      ctx.save();ctx.translate(221,151);
      ctx.rotate(piece.food==='pepper'?(piece.mirrored?-.76:.76):0);if(piece.mirrored)ctx.scale(-1,1);
      const w=piece.food==='pepper'?244:172,h=w*whole.naturalHeight/whole.naturalWidth;
      ctx.drawImage(whole,-w/2,-h/2,w,h);ctx.restore();
      ctx.save();ctx.globalCompositeOperation='source-atop';ctx.strokeStyle='rgba(255,253,218,.87)';
      ctx.lineWidth=3;ctx.setLineDash([6,4]);
      const count=cut[thickness],span=piece.food==='pepper'?300:154;
      for(let i=1;i<count;i++){
        const x=221+(i/count-.5)*span;ctx.beginPath();ctx.moveTo(x,16);ctx.lineTo(x,263);ctx.stroke();
      }
      ctx.restore();
    }
    const edgeCtx=edge.getContext('2d');
    edgeCtx.clearRect(0,0,220,220);edgeCtx.drawImage(face,0,0,220,220);
    edgeCtx.globalCompositeOperation='source-atop';edgeCtx.fillStyle='rgba(45,32,12,.36)';edgeCtx.fillRect(0,0,220,220);edgeCtx.globalCompositeOperation='source-over';
    const count=cut?Math.min(cut[thickness],4):1,w=cut?144:248,h=Math.min(215,w*face.naturalHeight/face.naturalWidth)*.66;
    const depth=pantry[food].depth/pantry[food].size*w*sliceThickness[thickness].scale*.78;
    for(let i=0;i<count;i++){
      ctx.save();ctx.translate(cut?500+i*19:360,cut?115+i*18:142);ctx.rotate((i-(count-1)/2)*.07);
      for(let y=Math.ceil(depth);y>0;y-=1.5)ctx.drawImage(edge,-w/2,-h/2+y,w,h);
      ctx.drawImage(face,-w/2,-h/2,w,h);ctx.restore();
    }
    if(drag){
      ctx.strokeStyle='#6a4b32';ctx.lineWidth=2.5;ctx.beginPath();
      ctx.moveTo(drag.x,drag.y);ctx.lineTo(drag.toX,drag.toY);ctx.stroke();
    }
  }
  function show(){
    for(const b of sheet.querySelectorAll('[data-thickness]'))b.setAttribute('aria-pressed',String(b.dataset.thickness===thickness));
    button.disabled=!!cut&&cut[thickness]>room;
    status.textContent=button.disabled?'Tabakta yer yok.':cut?cut[thickness]+' halka · Kesmek için kaydır.':'Dilim kalınlığı';
    draw();
  }
  for(const b of sheet.querySelectorAll('[data-thickness]'))b.onclick=()=>{thickness=b.dataset.thickness;show();};
  button.onclick=()=>{if(!button.disabled)apply(thickness);};
  if(cut){
    board.dataset.cut='true';
    function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*720/r.width,(e.clientY-r.top)*286/r.height];}
    board.onpointerdown=e=>{
      if(e.button!==0||drag||button.disabled)return;
      const [x,y]=point(e);drag={id:e.pointerId,x,y,toX:x,toY:y};board.setPointerCapture(e.pointerId);
    };
    board.onpointermove=e=>{if(e.pointerId===drag?.id){[drag.toX,drag.toY]=point(e);draw();}};
    board.onpointercancel=board.onlostpointercapture=e=>{if(e.pointerId===drag?.id){drag=null;draw();}};
    board.onpointerup=e=>{
      if(e.pointerId!==drag?.id)return;
      const [x,y]=point(e),length=Math.hypot(x-drag.x,y-drag.y);
      drag=null;if(length>55)button.click();else draw();
    };
  }
  Promise.all([face.decode(),whole.decode()]).then(draw).catch(()=>{});
  show();
}
