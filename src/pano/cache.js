// Store bytes because WebKit private sessions can reject IndexedDB writes of Blobs.
let database;
export const printLimit=48;
function openDatabase(){
  return database??=new Promise((resolve,reject)=>{
    const request=indexedDB.open('sofra-pano-prints',1);
    request.onupgradeneeded=()=>{
      const store=request.result.createObjectStore('photos',{keyPath:'key'});
      store.createIndex('saved','saved');
    };
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Print cache unavailable'));
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>{db.close();database=null;};
      db.onclose=()=>{database=null;};
      resolve(db);
    };
  }).catch(()=>null);
}
export async function readPrint(key){
  try{
    const db=await openDatabase();if(!db)return null;
    const record=await new Promise((resolve,reject)=>{
      const request=db.transaction('photos').objectStore('photos').get(key);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    return record?new Blob([record.bytes],{type:record.type}):null;
  }catch{return null;}
}
export async function savePrint(key,blob){
  try{
    const db=await openDatabase();if(!db)return;
    const bytes=await blob.arrayBuffer();
    const tx=db.transaction('photos','readwrite'),store=tx.objectStore('photos');
    store.put({key,bytes,type:blob.type,saved:Date.now()});
    // Insert and trim in one transaction so simultaneous tabs share the same limit.
    const count=store.count();
    count.onsuccess=()=>{
      let extra=count.result-printLimit;if(extra<=0)return;
      const oldest=store.index('saved').openKeyCursor();
      oldest.onsuccess=()=>{
        const cursor=oldest.result;if(!cursor)return;
        store.delete(cursor.primaryKey);if(--extra>0)cursor.continue();
      };
    };
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  }catch{/* The current visit can still use its in-memory photos. */}
}
