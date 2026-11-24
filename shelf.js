import { foods } from './model.js';
import { assetURL } from './asset-url.js';

export function mountShelf(board,onAdd,onDrop,items=foods,onHover=null) {
  const strip=document.querySelector('#foods');
  const prev=document.querySelector('#prev-food');
  const next=document.querySelector('#next-food');
  strip.replaceChildren(...items.map((food,i)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='food';
    if(food.kind==='topping' && items[i-1]?.kind==='spread')button.classList.add('first-solid');
    if(food.kind)button.dataset.kind=food.kind;
    button.dataset.food=food.id;
    button.setAttribute('aria-label',food.kind ? food.name+({spread:food.id==='menemen'?' kaşıkla':' sür',spice:' serp',sauce:' sık',topping:' ekle'}[food.kind]) : 'Add '+food.name+' · '+food.en);
    if(food.kind&&food.kind!=='topping')button.setAttribute('aria-pressed','false');
    const image=new Image();
    if(food.kind&&i>=8)image.loading='lazy';
    image.src=assetURL(food.kind==='sauce'?'bottle-'+food.id:food.asset||food.id);
    image.alt='';
    image.draggable=false;
    const name=document.createElement('span');
    name.lang='tr';name.textContent=food.name;
    button.append(image,name);
    return button;
  }));

  function updateArrows() {
    prev.disabled=strip.scrollLeft<1;
    next.disabled=strip.scrollLeft+strip.clientWidth>=strip.scrollWidth-1;
  }
  const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';
  function page(dir) {
    strip.scrollBy({left:dir*Math.max(95,strip.clientWidth*.7),behavior:motion()});
  }
  prev.onclick=()=>page(-1);
  next.onclick=()=>page(1);
  strip.addEventListener('scroll',updateArrows,{passive:true});
  new ResizeObserver(updateArrows).observe(strip);
  strip.addEventListener('wheel',event=>{
    if(event.ctrlKey || event.shiftKey || Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    const unit=event.deltaMode===1?16:event.deltaMode===2?strip.clientWidth:1;
    event.preventDefault();
    strip.scrollLeft+=event.deltaY*unit;
  },{passive:false});
  strip.addEventListener('keydown',event=>{
    const item=event.target.closest('.food');
    if(!item)return;
    const targets={ArrowRight:item.nextElementSibling,ArrowLeft:item.previousElementSibling,Home:strip.firstElementChild,End:strip.lastElementChild};
    if(!Object.hasOwn(targets,event.key))return;
    event.preventDefault();
    const target=targets[event.key];
    if(!target)return;
    target.focus({preventScroll:true});
    if(target===strip.firstElementChild||target===strip.lastElementChild){
      strip.scrollTo({left:target===strip.firstElementChild?0:strip.scrollWidth,behavior:motion()});
    }else target.scrollIntoView({block:'nearest',inline:'nearest',behavior:motion()});
  });

  // Horizontal swipes browse. Pulling a food upward places it at the release point.
  let gesture=null,ignoreClick=false;
  strip.addEventListener('pointerdown',event=>{
    const item=event.target.closest('.food');
    if(!item||event.button!==0||gesture)return;
    ignoreClick=false;
    gesture={id:event.pointerId,item,x:event.clientX,y:event.clientY,left:strip.scrollLeft,mode:null,ghost:null};
    item.setPointerCapture(event.pointerId);
  });
  strip.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.mode){
      if(Math.max(Math.abs(dx),Math.abs(dy))<7)return;
      gesture.mode=dy<0 && -dy>Math.abs(dx)*.8?'place':'scroll';
    }
    if(gesture.mode==='scroll'){
      if(event.pointerType==='mouse')strip.scrollLeft=gesture.left-dx;
      return;
    }
    if(!gesture.ghost){
      gesture.ghost=gesture.item.querySelector('img').cloneNode();
      gesture.ghost.className='drag-food';document.body.append(gesture.ghost);
    }
    const box=board.getBoundingClientRect();
    const inside=event.clientY>=box.top && event.clientY<=box.bottom;
    if(onHover){const preview=onHover(inside?gesture.item.dataset.food:null,event.clientX-box.left,event.clientY-box.top);gesture.ghost.hidden=inside&&preview!==false;}
    gesture.ghost.style.left=event.clientX+'px';
    gesture.ghost.style.top=event.clientY+'px';
  });
  function finish(event) {
    if(!gesture||gesture.id!==event.pointerId)return;
    const {mode,item,ghost}=gesture;
    gesture=null;ghost?.remove();
    if(onHover)onHover(null);
    ignoreClick=!!mode||event.type==='pointercancel';
    if(mode==='place'&&event.type==='pointerup'){
      const b=board.getBoundingClientRect();
      if(event.clientX>=b.left && event.clientX<=b.right && event.clientY>=b.top && event.clientY<=b.bottom)
        onDrop(item.dataset.food,event.clientX-b.left,event.clientY-b.top);
    }
  }
  strip.addEventListener('pointerup',finish);
  strip.addEventListener('pointercancel',finish);
  strip.addEventListener('lostpointercapture',finish);
  strip.addEventListener('click',event=>{
    const item=event.target.closest('.food');
    if(item && (!ignoreClick || event.detail===0))onAdd(item.dataset.food);
    ignoreClick=false;
  });
  updateArrows();
  return function resetShelf(){
    if(gesture){
      const {item,id,ghost}=gesture;
      gesture=null;ignoreClick=true;ghost?.remove();
      if(item.hasPointerCapture(id))item.releasePointerCapture(id);
      onHover?.(null);
    }
    strip.scrollTo({left:0,behavior:'instant'});updateArrows();
  };
}
