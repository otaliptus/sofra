export function photoStore() {
  let opened;
  function open(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open('sofra-simit-album',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('photos',{keyPath:'id',autoIncrement:true});
      request.onsuccess=()=>{
        const db=request.result;
        db.onversionchange=()=>{db.close();opened=null;};
        db.onclose=()=>{opened=null;};
        resolve(db);
      };
      request.onerror=()=>reject(request.error);
    }).catch(error=>{opened=null;throw error;});
  }
  return async (action,record)=>{
    const db=await (opened??=open());
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('photos',action==='keep'?'readwrite':'readonly'),store=tx.objectStore('photos');
      const request=action==='keep'?store.add(record):store.getAll();
      tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  };
}
