const api='/api/pano';
export async function boardRequest(path='',options={}){
  const response=await fetch(api+path,{...options,headers:options.body?{'Content-Type':'application/json'}:undefined});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw Error(data?.error||'Panoya bağlanılamadı. Tekrar dene.');
  return data;
}
let session;
export async function boardWrite(path,body={},method='POST'){
  // Only a user who publishes, votes or reports needs an anonymous cookie.
  const post=()=>boardRequest(path,{method,body:JSON.stringify(body)});
  session??=boardRequest('/session',{method:'POST',body:'{}'}).catch(error=>{session=null;throw error;});
  await session;
  return post();
}
export const publicURL=id=>new URL('/pano.html?p='+encodeURIComponent(id),location.origin).href;
