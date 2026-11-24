import {boardRequest,boardWrite,publicURL} from './pano-api.js';
import {breads,cloths,pantry,recipeURL} from './recipe.js';
import {assetURL} from './asset-url.js';

const $=selector=>document.querySelector(selector);
const pins=$('#pins'),dialog=$('#post'),more=$('#more'),notice=$('#status');
const viewerURL=typeof SOFRA_PANO_VIEWER==='undefined'?'./pano-renderer.js':SOFRA_PANO_VIEWER;
const dateLabel=ms=>new Intl.DateTimeFormat('tr',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Istanbul'}).format(ms);
let sort='new',pageToken=null,revision=0,detailRevision=0,current=null,confirmAction=null;
const known=new Set(),prints=new Map();
const initialURL=new URL(location.href);
const removalKey=/^#kaldir=([a-f0-9]{64})$/.exec(initialURL.hash)?.[1],removalPost=initialURL.searchParams.get('p');
if(removalKey){initialURL.hash='';history.replaceState(null,'',initialURL);}
let queue=Promise.resolve(),viewerUnavailable=false;
const observer=new IntersectionObserver(entries=>{
  for(const e of entries)if(e.isIntersecting){
    observer.unobserve(e.target);const job=e.target.drawPrint;delete e.target.drawPrint;job?.();
  }
},{rootMargin:'80px'});
function picture(post,size){
  const box=document.createElement('div');box.className='picture';
  // An overhead composition stays available on devices without WebGL.
  box.style.backgroundImage='url("'+assetURL(cloths[post.recipe.cloth].asset)+'")';
  function layer(asset,x,z,width,angle=0){
    const img=new Image();img.alt='';img.src=assetURL(asset);
    Object.assign(img.style,{position:'absolute',left:(50+x*54)+'%',top:(50+z*54)+'%',width:width*54+'%',height:'auto',transform:'translate(-50%,-50%) rotate('+(-angle)+'rad)'});box.append(img);
  }
  layer('kahvalti-tabagi',0,0,1.67);
  if(!post.recipe.baseRemoved)layer(breads[post.recipe.bread].asset,0,0,1);
  for(const p of post.recipe.pieces){const f=pantry[p.food];layer(f.asset||p.food,p.x,p.z,f.size||(f.bread?1:.32),p.a);}
  const apply=src=>{const img=new Image();img.src=src;img.alt=post.title;box.replaceChildren(img);};
  const key=post.id+'-'+size;
  if(prints.has(key))apply(prints.get(key));
  else{
    box.drawPrint=()=>{
      queue=queue.then(async()=>{
        if(viewerUnavailable||!box.isConnected)return;
        if(!prints.has(key)){
          const {printRecipe}=await import(viewerURL);
          const canvas=await printRecipe(post,size);
          const src=canvas.toDataURL('image/webp',.83);
          if(prints.size>=40)prints.delete(prints.keys().next().value);
          prints.set(key,src);
        }
        if(box.isConnected)apply(prints.get(key));
      }).catch(()=>{viewerUnavailable=true;});
    };
    observer.observe(box);
  }
  return box;
}
function closeDetail(){
  current=null;detailRevision++;if(dialog.open)dialog.close();
  const url=new URL(location.href);if(url.searchParams.has('p')){url.searchParams.delete('p');history.replaceState(null,'',url);}
}
function renderCard(post){
  const a=document.createElement('a');a.className='pin';a.href=publicURL(post.id);
  a.style.setProperty('--lean',((parseInt(post.id.slice(0,2),16)%15-7)/6)+'deg');
  const h=document.createElement('h2');h.textContent=post.title;
  const meta=document.createElement('div');meta.className='meta';
  const stamp=document.createElement('span');stamp.textContent=dateLabel(post.created);
  const hearts=document.createElement('span');hearts.className='hearts';hearts.textContent='♥ '+post.total;
  meta.append(stamp,hearts);a.append(picture(post,320),h,meta);
  a.onclick=e=>{if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();openPost(post.id,true);};
  pins.append(a);
}
async function load(reset){
  const gen=reset?++revision:revision;
  if(reset){for(const pic of pins.querySelectorAll('.picture'))observer.unobserve(pic);known.clear();pins.replaceChildren();pageToken=null;$('#empty').hidden=true;}
  more.disabled=true;more.hidden=true;notice.textContent='Tarifler yükleniyor…';
  try{
    const data=await boardRequest('?sort='+sort+(pageToken?'&after='+encodeURIComponent(pageToken):''));
    if(gen!==revision)return;
    for(const p of data.posts)if(!known.has(p.id)){known.add(p.id);renderCard(p);}
    pageToken=data.after;more.hidden=!pageToken;notice.textContent='';
    if(!known.size){
      $('#empty').hidden=false;
      const period=sort==='day'||sort==='week';
      $('#empty h2').textContent=period?(sort==='day'?'Bugün henüz tarif veya oy yok.':'Bu hafta henüz tarif veya oy yok.'):'İlk sofrayı sen as.';
      $('#empty p').textContent=period?'Bir tarif as veya panodaki bir tarife oy ver.':'Kahvaltını hazırla, fotoğrafını çek ve “Panoya as”a dokun.';
      const action=$('#empty a');action.textContent=period?'Yeni tariflere bak':'Soframı hazırla ↗';action.href=period?'./pano.html':'./';
      action.onclick=period?e=>{e.preventDefault();setSort('new');}:null;
    }
  }catch(error){if(gen===revision){notice.textContent=error.message;more.textContent='Tekrar dene';more.hidden=false;}}
  finally{if(gen===revision)more.disabled=false;}
}
function setSort(value){
  sort=value;more.textContent='Daha fazla göster';
  for(const button of document.querySelectorAll('[data-sort]'))button.setAttribute('aria-pressed',String(button.dataset.sort===sort));
  load(true);
}
async function openPost(id,changeURL=false,replacePrint=true){
  const gen=++detailRevision;current=null;$('#confirm').hidden=true;$('#feedback').textContent='';
  if(changeURL){const url=new URL(location.href);url.searchParams.set('p',id);history.pushState(null,'',url);}
  if(!dialog.open)dialog.showModal();
  if(replacePrint){$('#post-title').textContent='Tarif yükleniyor…';$('#portrait').replaceChildren();}
  dialog.classList.add('loading');
  try{
    const p=await boardRequest('/'+id);if(gen!==detailRevision||!dialog.open)return;
    current=p;dialog.classList.remove('loading');
    $('#post-title').textContent=p.title;$('#post-date').textContent=dateLabel(p.created)+' · Toplam '+p.total+' oy';
    const ingredients=new Set();
    if(!p.recipe.baseRemoved)ingredients.add(breads[p.recipe.bread].name);
    for(const mark of p.recipe.strokes)ingredients.add(pantry[mark.food].name);
    for(const piece of p.recipe.pieces){ingredients.add(pantry[piece.food].name);for(const mark of piece.marks||[])ingredients.add(pantry[mark.food].name);}
    $('#ingredients').textContent=[...ingredients].join(' · ');
    if(replacePrint)$('#portrait').replaceChildren(picture(p,640));
    $('#vote').textContent=(p.mine?'♥':p.voted?'♥ Oy verdin':'♡ Oy ver');
    $('#vote').disabled=!!(p.mine||p.voted);$('#remove').hidden=!p.mine&&!(removalKey&&id===removalPost);$('#report').hidden=!!p.mine;$('#report').disabled=!!p.reported;
    $('#report').textContent=p.reported?'Bildirildi':'Bildir';
    const dest=new URL('/',location.origin);dest.hash=new URL(recipeURL(p.recipe)).hash;$('#remix').href=dest.href;
  }catch(error){if(gen===detailRevision){$('#post-title').textContent=error.message;$('#portrait').replaceChildren();}}
}
function route(){
  const id=new URL(location.href).searchParams.get('p');
  if(id&&/^[a-f0-9]{32}$/.test(id))openPost(id);else closeDetail();
}
for(const b of document.querySelectorAll('[data-sort]'))b.onclick=()=>setSort(b.dataset.sort);
more.onclick=()=>{more.textContent='Daha fazla göster';load(false);};
$('#close').onclick=closeDetail;dialog.addEventListener('cancel',e=>{e.preventDefault();closeDetail();});
dialog.onclick=e=>{if(e.target===dialog)closeDetail();};window.addEventListener('popstate',route);
async function mutate(action){
  if(!current)return;
  const id=current.id,button=$('#'+action);button.disabled=true;$('#feedback').textContent='';
  try{
    await boardWrite('/'+id+(action==='remove'?'':'/'+action),action==='remove'&&id===removalPost?{key:removalKey}:{},action==='remove'?'DELETE':'POST');
    if(current?.id!==id)return;
    if(action==='remove'){closeDetail();await load(true);return;}
    await openPost(id,false,false);
    if(action==='vote')await load(true);
  }catch(error){if(current?.id===id){$('#feedback').textContent=error.message;button.disabled=false;}}
}
$('#vote').onclick=()=>mutate('vote');
for(const action of ['report','remove'])$('#'+action).onclick=()=>{
  confirmAction=action;$('#confirm-label').textContent=action==='remove'?'Tarifin herkesin panosundan kaldırılsın mı?':'Bu tarif incelenmek üzere bildirilsin mi?';
  $('#confirm').hidden=false;$('#confirm-no').focus();
};
$('#confirm-no').onclick=()=>$('#confirm').hidden=true;
$('#confirm-yes').onclick=()=>{$('#confirm').hidden=true;mutate(confirmAction);};
$('#share').onclick=async()=>{if(!current)return;const url=publicURL(current.id);try{await navigator.clipboard.writeText(url);$('#feedback').textContent='Bağlantı kopyalandı.';}catch{$('#feedback').textContent=url;}};
load(true);route();
