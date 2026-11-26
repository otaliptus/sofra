import {workflow,detailEdges} from '../shared/workflows.js';
import {boardRequest,boardWrite,publicURL} from './api.js';
import {breads,pantry,recipeURL} from '../shared/recipe.js';
import {picture,clearPictures,resumeCards} from './prints.js';

const $=selector=>document.querySelector(selector);
const pins=$('#pins'),dialog=$('#post'),more=$('#more'),notice=$('#status');
const dates=new Intl.DateTimeFormat('tr',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Istanbul'});
const dateLabel=ms=>dates.format(ms);
const detail=workflow(detailEdges);
let sort='new',pageToken=null,revision=0,current=null;
const known=new Set();
const initialURL=new URL(location.href);
const removalKey=/^#kaldir=([a-f0-9]{64})$/.exec(initialURL.hash)?.[1],removalPost=initialURL.searchParams.get('p');
if(removalKey){initialURL.hash='';history.replaceState(null,'',initialURL);}
function closeDetail(){
  detail.send('dismiss');current=null;clearPictures($('#portrait'));if(dialog.open)dialog.close();resumeCards();
  const url=new URL(location.href);if(url.searchParams.has('p')){url.searchParams.delete('p');history.replaceState(null,'',url);}
}
function renderCard(post){
  const a=document.createElement('a');a.className='pin';a.href=publicURL(post.id);
  a.style.setProperty('--lean',((parseInt(post.id.slice(0,2),16)%15-7)/6)+'deg');
  const h=document.createElement('h2');h.textContent=post.title;
  const meta=document.createElement('div');meta.className='meta';
  const stamp=document.createElement('span');stamp.textContent=dateLabel(post.created);
  const hearts=document.createElement('span');hearts.className='hearts';hearts.textContent='♥ '+post.total;
  const photo=picture(post,320);meta.append(stamp,hearts);a.append(photo,h,meta);
  a.onclick=e=>{if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();openPost(post.id,{changeURL:true,card:post,photo});};
  pins.append(a);
}
async function load(reset){
  const gen=reset?++revision:revision;
  if(reset){clearPictures(pins);known.clear();pageToken=null;$('#empty').hidden=true;}
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
async function openPost(id,{changeURL=false,replacePrint=true,card=null,photo}={}){
  detail.send('dismiss');const visit=detail.send('open');current=null;$('#confirm').hidden=true;$('#feedback').textContent='';
  if(changeURL){const url=new URL(location.href);url.searchParams.set('p',id);history.pushState(null,'',url);}
  if(!dialog.open)dialog.showModal();
  if(replacePrint){
    clearPictures($('#portrait'));$('#post-title').textContent=card?.title||'Tarif yükleniyor…';
    if(card)$('#portrait').append(picture(card,640,photo));
  }
  dialog.classList.add('loading');
  try{
    const p=await boardRequest('/'+id);if(!dialog.open||!detail.send('loaded',visit))return;
    current=p;dialog.classList.remove('loading');
    $('#post-title').textContent=p.title;$('#post-date').textContent=dateLabel(p.created)+' · Toplam '+p.total+' oy';
    const ingredients=new Set();
    if(!p.recipe.baseRemoved)ingredients.add(breads[p.recipe.bread].name);
    for(const mark of p.recipe.strokes)ingredients.add(pantry[mark.food].name);
    for(const piece of p.recipe.pieces){ingredients.add(pantry[piece.food].name);for(const mark of piece.marks||[])ingredients.add(pantry[mark.food].name);}
    $('#ingredients').textContent=[...ingredients].join(' · ');
    if(replacePrint&&!card)$('#portrait').append(picture(p,640));
    $('#vote').textContent=(p.mine?'♥':p.voted?'♥ Oy verdin':'♡ Oy ver');
    syncActions();$('#remove').hidden=!p.mine&&!(removalKey&&id===removalPost);$('#report').hidden=!!p.mine;
    $('#report').textContent=p.reported?'Bildirildi':'Bildir';
    const dest=new URL('/',location.origin);dest.hash=new URL(recipeURL(p.recipe)).hash;$('#remix').href=dest.href;
  }catch(error){if(dialog.open&&detail.send('failed',visit)){$('#post-title').textContent=error.message;clearPictures($('#portrait'));}}
}
function route(){
  const id=new URL(location.href).searchParams.get('p');
  if(id&&/^[a-f0-9]{32}$/.test(id))openPost(id);else closeDetail();
}
for(const b of document.querySelectorAll('[data-sort]'))b.onclick=()=>setSort(b.dataset.sort);
more.onclick=()=>{more.textContent='Daha fazla göster';load(false);};
$('#close').onclick=closeDetail;dialog.addEventListener('cancel',e=>{e.preventDefault();closeDetail();});
dialog.onclick=e=>{if(e.target===dialog)closeDetail();};window.addEventListener('popstate',route);
function syncActions(){
  const ready=detail.state==='ready';
  $('#vote').disabled=!ready||current.mine||current.voted;
  $('#report').disabled=!ready||current.mine||current.reported;
  $('#remove').disabled=!ready;
}
async function mutate(action){
  if(!current)return;
  const visit=detail.send(action);if(!visit)return;
  const id=current.id;syncActions();$('#confirm').hidden=true;$('#feedback').textContent='';
  try{
    await boardWrite('/'+id+(action==='remove'?'':'/'+action),action==='remove'&&id===removalPost?{key:removalKey}:{},action==='remove'?'DELETE':'POST');
    // The feed is shared across visits. A successful vote/removal still affects it.
    if(action!=='report')load(true);
    if(!detail.send('success',visit))return;
    if(action==='remove'){closeDetail();return;}
    await openPost(id,{replacePrint:false});
  }catch(error){
    if(detail.send('failed',visit)){$('#feedback').textContent=error.message;syncActions();}
  }
}
$('#vote').onclick=()=>mutate('vote');
for(const action of ['report','remove'])$('#'+action).onclick=()=>{
  if(!detail.send(action==='remove'?'askRemove':'askReport'))return;
  syncActions();
  $('#confirm-label').textContent=action==='remove'?'Tarifin herkesin panosundan kaldırılsın mı?':'Bu tarif incelenmek üzere bildirilsin mi?';
  $('#confirm').hidden=false;$('#confirm-no').focus();
};
$('#confirm-no').onclick=()=>{
  if(!detail.send('cancel'))return;
  $('#confirm').hidden=true;syncActions();
};
$('#confirm-yes').onclick=()=>{
  if(detail.state==='confirmReport')mutate('report');
  if(detail.state==='confirmRemove')mutate('remove');
};
$('#share').onclick=async()=>{
  if(!current)return;
  const visit=detail.visit,url=publicURL(current.id);
  let message;try{await navigator.clipboard.writeText(url);message='Bağlantı kopyalandı.';}catch{message=url;}
  if(detail.visit===visit)$('#feedback').textContent=message;
};
load(true);route();
