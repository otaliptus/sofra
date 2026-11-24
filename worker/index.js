import { shareableRecipe } from '../recipe.js';
import { securityHeaders } from './security-headers.mjs';

const root='/api/pano', rowLimit=8, bodyLimit=48*1024;
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers
}});
class BoardError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
const fail=(status,message)=>{throw new BoardError(status,message);};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
export function calendar(now){
  const date=new Date(now+3*3600000),day=date.toISOString().slice(0,10);
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  return {day,week:date.toISOString().slice(0,10)};
}
async function readBody(request,max){
  if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON gerekli.');
  if(Number(request.headers.get('content-length'))>max)fail(413,'Tarif çok büyük.');
  const stream=request.body?.getReader();if(!stream)fail(400,'İstek boş.');
  const bytes=new Uint8Array(max);let length=0;
  while(true){
    const {value,done}=await stream.read();if(done)break;
    if(length+value.length>max){await stream.cancel();fail(413,'Tarif çok büyük.');}
    bytes.set(value,length);length+=value.length;
  }
  try{return JSON.parse(new TextDecoder().decode(bytes.subarray(0,length)));}catch{fail(400,'Geçersiz istek.');}
}
export function normalizePost(input){
  if(!input||typeof input.title!=='string')fail(400,'Tarife bir ad ver.');
  const title=input.title.normalize('NFC').trim().replace(/\s+/gu,' ');
  if(!title||[...title].length>48||/[\p{Cc}\p{Cf}<>]/u.test(title))fail(400,'Tarif adı 1–48 karakter olmalı.');
  const recipe=shareableRecipe(input.recipe);
  if(!recipe)fail(400,'Bu tarif panoda gösterilemiyor. Daha sade bir tarif dene.');
  const angle=['top','low','tilt','corner','free'].includes(input.angle)?input.angle:'tilt';
  const pose=input.pose;
  if(!pose||!Number.isFinite(pose.yaw)||!Number.isFinite(pose.elevation))fail(400,'Fotoğraf açısı geçersiz.');
  const camera={yaw:pose.yaw%(Math.PI*2),elevation:Math.max(.2,Math.min(Math.PI/2,pose.elevation))};
  const f=input.frame;
  const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
  const frame=f&&Array.isArray(f.target)&&f.target.length===3&&f.target.every(n=>finite(n,-4,4))&&
    finite(f.distance,.1,20)&&finite(f.tan,.1,1)&&finite(f.aspect,.1,12)
    ?{target:f.target,distance:f.distance,tan:f.tan,aspect:f.aspect}:undefined;
  const scene=JSON.stringify({recipe,angle,pose:camera,frame});
  if(new TextEncoder().encode(scene).length>bodyLimit-512)fail(413,'Tarif çok büyük.');
  return {title,scene};
}
function cookieName(url){return url.protocol==='https:'?'__Host-sofra-pano':'sofra-pano-dev';}
function cookie(request,url){
  return (request.headers.get('Cookie')||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName(url)+'='))?.split('=')[1]||'';
}
function periodKey(sort,time){return sort==='day'?'d:'+time.day:sort==='week'?'w:'+time.week:'all';}
function item(row){
  const {scene,...meta}=row;return {...meta,...JSON.parse(scene)};
}
async function feed(url,env,ctx,time){
  const sort=url.searchParams.get('sort')||'new';
  if(!['new','day','week','all'].includes(sort))fail(400,'Sıralama geçersiz.');
  const period=periodKey(sort,time),cursor=url.searchParams.get('after');
  let total=0,created=0,id='';
  if(cursor){
    if(!/^\d{1,10}\.\d{1,15}\.[a-f0-9]{32}$/.test(cursor))fail(400,'Sayfa geçersiz.');
    const parts=cursor.split('.');total=Number(parts[0]);created=Number(parts[1]);id=parts[2];
  }
  // Cache only the finite set of first pages, never cookies or personal flags.
  const key=new Request(url.origin+root+'?sort='+sort+'&epoch='+period);
  if(!cursor){const hit=await caches.default.match(key);if(hit)return hit;}
  let sql,values;
  if(sort==='new'){
    sql='SELECT p.id,p.title,p.created,p.scene,coalesce(s.total,0) AS total FROM posts p LEFT JOIN scores s ON s.period=\'all\' AND s.post=p.id WHERE p.hidden=0'+
      (cursor?' AND (p.created,p.id)<(?,?)':'')+' ORDER BY p.created DESC,p.id DESC LIMIT ?';
    values=cursor?[created,id]:[];
  }else{
    sql='SELECT p.id,p.title,p.created,p.scene,s.total FROM scores s JOIN posts p ON p.id=s.post WHERE s.period=? AND p.hidden=0'+
      (cursor?' AND (s.total,s.created,s.post)<(?,?,?)':'')+' ORDER BY s.total DESC,s.created DESC,s.post DESC LIMIT ?';
    values=cursor?[period,total,created,id]:[period];
  }
  const {results}=await env.DB.prepare(sql).bind(...values,rowLimit+1).all();
  const rows=results.slice(0,rowLimit),last=rows.at(-1);
  const response=json({posts:rows.map(item),after:results.length>rowLimit?[last.total,last.created,last.id].join('.'):null},200,
    cursor?{}:{'Cache-Control':'public, max-age=0, s-maxage=20'});
  if(!cursor)ctx.waitUntil(caches.default.put(key,response.clone()));
  return response;
}
async function handle(request,env,ctx){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!path.startsWith('/api/'))return servePage(request,env);
  const time=calendar(Date.now());
  if(path===root&&method==='GET')return feed(url,env,ctx,time);
  const match=/^\/api\/pano\/([0-9a-f]{32})(?:\/(vote|report))?$/.exec(path);
  const raw=cookie(request,url),actor=/^[a-f0-9]{64}$/.test(raw)?await digest(raw):null;
  if(match&&!match[2]&&method==='GET'){
    const row=await env.DB.prepare(`SELECT p.id,p.title,p.scene,p.created,p.owner=? AS mine,
      EXISTS(SELECT 1 FROM votes WHERE post=p.id AND voter=? AND day=?) AS voted,
      EXISTS(SELECT 1 FROM reports WHERE post=p.id AND voter=?) AS reported,
      coalesce((SELECT total FROM scores WHERE period='all' AND post=p.id),0) AS total
      FROM posts p WHERE id=? AND hidden=0`).bind(actor,actor,time.day,actor,match[1]).first();
    return row?json(item(row)):json({error:'Tarif panoda bulunamadı.'},404);
  }
  if(!['POST','DELETE'].includes(method)||(!match&&path!==root&&path!==root+'/session'))fail(404,'Bulunamadı.');
  if(request.headers.get('Origin')!==url.origin)fail(403,'İstek bu siteden gelmeli.');
  const ip=request.headers.get('CF-Connecting-IP')||'local';
  if(!(await env.BOARD_WRITES.limit({key:ip})).success)fail(429,'Biraz bekleyip tekrar dene.');
  const data=await readBody(request,path===root?bodyLimit:128);
  if(path===root+'/session'&&method==='POST'){
    if(actor)return json({ok:true});
    const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
    return json({ok:true},200,{'Set-Cookie':cookieName(url)+'='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'+(url.protocol==='https:'?'; Secure':'')});
  }
  if(!actor)fail(401,'Pano için bu sitede çerezlere izin ver.');
  const db=env.DB,now=Date.now();
  if(match&&!match[2]&&method==='DELETE'){
    const row=await db.prepare('SELECT owner FROM posts WHERE id=?').bind(match[1]).first();
    if(!row)fail(404,'Bu tarif kaldırılamadı.');
    if(row.owner!==actor){
      if(typeof data?.key!=='string'||!/^[a-f0-9]{64}$/.test(data.key))fail(403,'Kaldırma yetkin yok.');
      const salt=await db.prepare('SELECT salt FROM board_keys WHERE id=1').first('salt');
      if(await digest(salt+'|remove|'+match[1]+'|'+row.owner)!==data.key)fail(403,'Kaldırma yetkin yok.');
    }
    const result=await db.prepare('DELETE FROM posts WHERE id=? AND owner=?').bind(match[1],row.owner).run();
    if(!result.meta.changes)fail(404,'Bu tarif kaldırılamadı.');
  }else{
    const salt=await db.prepare('SELECT salt FROM board_keys WHERE id=1').first('salt');
    const net=(await digest(salt+'|'+time.day+'|'+ip)).slice(0,32);
    if(path===root&&method==='POST'){
      const {title,scene}=normalizePost(data);
      const id=(await digest(actor+'|'+scene)).slice(0,32);
      const insert=await db.prepare('INSERT INTO posts(id,owner,title,scene,created,day,network) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
        .bind(id,actor,title,scene,now,time.day,net).run();
      const created=insert.meta.changes>0;
      if(!created&&await db.prepare('SELECT hidden FROM posts WHERE id=?').bind(id).first('hidden'))fail(409,'Bu tarif panodan kaldırılmış.');
      if(created)invalidate(url,ctx,time);
      return json({id,created,removeKey:await digest(salt+'|remove|'+id+'|'+actor)},created?201:200);
    }
    if(!match||method!=='POST'||!match[2])fail(404,'Bulunamadı.');
    const post=match[1],vote=match[2]==='vote';
    const result=vote?await db.prepare(`INSERT INTO votes(post,voter,day,week,network)
      SELECT id,?,?,?,? FROM posts WHERE id=? AND hidden=0 AND owner<>? ON CONFLICT DO NOTHING`)
      .bind(actor,time.day,time.week,net,post,actor).run():
      await db.prepare(`INSERT INTO reports(post,voter,day,network)
        SELECT id,?,?,? FROM posts WHERE id=? AND hidden=0 AND owner<>? ON CONFLICT DO NOTHING`)
        .bind(actor,time.day,net,post,actor).run();
    if(!result.meta.changes){
      const existing=await db.prepare('SELECT owner FROM posts WHERE id=? AND hidden=0').bind(post).first();
      if(!existing)fail(404,'Tarif artık panoda değil.');
      if(existing.owner===actor)fail(403,'Kendi tarifine bunu yapamazsın.');
    }
    if(!vote)return json({ok:true});
  }
  invalidate(url,ctx,time);return json({ok:true});
}
async function servePage(request,env){
  // Each document needs a fresh CSP nonce for Cloudflare's injected bot check.
  const headers=new Headers(request.headers);
  for(const name of ['if-none-match','if-modified-since','range'])headers.delete(name);
  const asset=await env.ASSETS.fetch(new Request(request,{headers}));
  if(asset.status!==200||!asset.headers.get('Content-Type')?.startsWith('text/html'))return asset;
  const nonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
  const page=new Response(asset.body,asset);
  for(const [name,value] of Object.entries(securityHeaders(`'nonce-${nonce}'`)))page.headers.set(name,value);
  page.headers.set('Cache-Control','private, no-store');
  page.headers.delete('ETag');
  if(!asset.body)return page;
  return new HTMLRewriter().on('script#legacy-redirect',{
    element(script){script.setAttribute('nonce',nonce);}
  }).transform(page);
}
function invalidate(url,ctx,time){
  ctx.waitUntil(Promise.all(['new','day','week','all'].map(sort=>
    caches.default.delete(url.origin+root+'?sort='+sort+'&epoch='+periodKey(sort,time)))));
}
export default {
  async fetch(request,env,ctx){
    try{return await handle(request,env,ctx);}catch(error){
      if(error instanceof BoardError)return json({error:error.message},error.status);
      if(/board_daily_limit|board_capacity/.test(String(error)+' '+String(error.cause)))return json({error:'Pano sınırına ulaşıldı. Daha sonra tekrar dene.'},429);
      console.error('Pano request failed',error.name,String(error.message).slice(0,160));return json({error:'Pano şu an dinleniyor. Biraz sonra tekrar dene.'},503);
    }
  },
  async scheduled(event,env){
    const time=calendar(event.scheduledTime);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM votes WHERE day<?').bind(time.day),
      env.DB.prepare('DELETE FROM daily_usage WHERE day<?').bind(time.day),
      env.DB.prepare("DELETE FROM scores WHERE (period BETWEEN 'd:' AND ?) OR (period BETWEEN 'w:' AND ?)").bind('d:'+calendar(event.scheduledTime-86400000).day,'w:'+calendar(event.scheduledTime-7*86400000).week)
    ]);
  }
};
