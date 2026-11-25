import {breads,cloths,pantry} from './recipe.js';
import {thumbnailURL} from './asset-url.js';
import {printLimit,readPrint,savePrint} from './pano-cache.js';

const printer=new URL(document.querySelector('[name=pano-printer]').content,document.baseURI);
const memory=new Map(),pending=new Map(),pictures=new WeakMap();
let worker,idleTimer,active,unavailable=false;
let canUseWorker=typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined';
// The production worker URL versions the art and renderer. Raw development modules are mutable.
const versioned=!printer.pathname.endsWith('/pano-worker.js');
const cacheKey=key=>printer.href+'?print='+key;
function remember(job,blob){
  const {key,post,size}=job;
  if(!memory.has(key)&&memory.size>=printLimit)memory.delete(memory.keys().next().value);
  memory.set(key,blob);
  if(size===320){
    for(const other of pending.values()){
      if(other.size===640&&other.post.id===post.id&&!other.blob)show(other,blob);
    }
  }
}
function releaseWorker(){worker?.terminate();worker=null;}
async function print(post,size){
  if(canUseWorker){
    try{
      worker??=new Worker(printer,{type:'module'});
      return await new Promise((resolve,reject)=>{
        worker.onmessage=({data})=>data.blob?resolve(data.blob):reject(Error('Print worker unavailable'));
        worker.onerror=event=>{event.preventDefault();reject(Error('Print worker unavailable'));};
        worker.onmessageerror=reject;
        worker.postMessage({post,size,base:document.baseURI});
      });
    }catch{releaseWorker();canUseWorker=false;}
  }
  const {printRecipe}=await import('./pano-renderer.js');
  const canvas=await printRecipe(post,size,document.querySelector('#studio canvas'));
  return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.83));
}
const thumbnails=new Map();
function thumbnail(id){
  if(!thumbnails.has(id)){
    const image=new Image();image.src=thumbnailURL(id);
    thumbnails.set(id,image.decode().then(()=>image).catch(()=>{thumbnails.delete(id);return null;}));
  }
  return thumbnails.get(id);
}
async function preview(job){
  const {box,post,size}=job,recipe=post.recipe;
  box.style.backgroundImage='url("'+thumbnailURL(cloths[recipe.cloth].asset)+'")';
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label',post.title);box.append(canvas);
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.scale(size,size);
  const base=[['kahvalti-tabagi',0,0,1.67,0]];
  if(!recipe.baseRemoved)base.push([breads[recipe.bread].asset,0,0,1,0]);
  const foods=recipe.pieces.map(p=>{
    const f=pantry[p.food];return [f.asset||p.food,p.x,p.z,f.size||(f.bread?1:.32),p.a];
  });
  async function layers(parts){
    const images=await Promise.all(parts.map(([id])=>thumbnail(id)));
    if(canvas.parentNode!==box||!box.isConnected)return;
    parts.forEach(([,x,z,w,angle],i)=>{
      const image=images[i];if(!image)return;
      const width=w*.54,height=width*image.height/image.width;
      ctx.save();ctx.translate(.5+x*.54,.5+z*.54);ctx.rotate(-angle);
      ctx.drawImage(image,-width/2,-height/2,width,height);ctx.restore();
    });
  }
  await layers(base);if(canvas.parentNode===box&&box.isConnected)await layers(foods);
}
function show(job,blob){
  const img=new Image(),previous=job.url;
  job.blob=blob;job.url=URL.createObjectURL(blob);img.alt=job.post.title;img.src=job.url;
  job.box.replaceChildren(img);job.box.style.backgroundImage='';
  if(previous)URL.revokeObjectURL(previous);
}
function done(job){
  pending.delete(job.box);observer.unobserve(job.box);
}
async function pump(){
  if(document.hidden)return;
  const modal=document.querySelector('#post').open;
  const job=[...pending.values()].find(j=>j!==active&&j.visible&&j.ready&&j.box.isConnected&&(!modal||j.size===640));
  if(!job)return;
  if(active){
    // Fetch the next visible recipe's missing textures while the current photo renders.
    if(worker&&!active.warming){
      active.warming=true;worker.postMessage({warm:job.post.recipe,base:document.baseURI});
    }
    return;
  }
  active=job;clearTimeout(idleTimer);queueMicrotask(pump);
  try{
    const blob=memory.get(job.key)||(!unavailable&&await print(job.post,job.size));
    if(blob){
      if(!memory.has(job.key)){remember(job,blob);if(versioned)void savePrint(cacheKey(job.key),blob);}
      if(pending.has(job.box))show(job,blob);
    }
  }catch(error){if(error.name==='ViewerUnavailable')unavailable=true;}
  finally{
    done(job);active=null;
    if(worker){
      if(document.hidden)releaseWorker();
      else idleTimer=setTimeout(releaseWorker,60000);
    }
    void pump();
  }
}
async function lookup(job){
  job.checked=true;
  const blob=versioned&&await readPrint(cacheKey(job.key));
  if(blob){
    remember(job,blob);
    if(pending.has(job.box))show(job,blob);
    done(job);return;
  }
  job.ready=true;
  if(job.visible&&pending.has(job.box)&&!job.box.childElementCount)void preview(job);
  void pump();
}
function activate(job){
  if(!job.checked){void lookup(job);return;}
  if(job.ready&&!job.box.childElementCount)void preview(job);
  void pump();
}
const observer=new IntersectionObserver(entries=>{
  for(const {target,isIntersecting} of entries){
    const job=pending.get(target);if(!job)continue;
    job.visible=isIntersecting;
    if(isIntersecting)activate(job);
  }
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&!active)releaseWorker();else void pump();
});
export function picture(post,size,card){
  const box=document.createElement('div');box.className='picture';
  const key=post.id+'-'+size,job={box,key,post,size};
  pictures.set(box,job);
  if(memory.has(key)){show(job,memory.get(key));return box;}
  if(size===640){
    const thumb=pictures.get(card)?.blob||memory.get(post.id+'-320');
    if(thumb)show(job,thumb);
  }
  pending.set(box,job);observer.observe(box);
  return box;
}
export function clearPictures(container){
  for(const box of container.querySelectorAll('.picture')){
    const job=pictures.get(box);if(!job)continue;
    done(job);if(job.url)URL.revokeObjectURL(job.url);
  }
  container.replaceChildren();
}
export function resumeCards(){void pump();}
