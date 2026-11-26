import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../../worker/index.js';
import {emptyRecipe} from '../../src/shared/recipe.js';

test('Worker receipts, weekly scores and charged quotas across removal, republication and pruning',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec('PRAGMA foreign_keys=ON');
  const migrations=new URL('../../migrations/',import.meta.url);
  for(const file of readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort())
    db.exec(readFileSync(new URL(file,migrations),'utf8'));
  const origin='http://localhost';
  const env={BOARD_WRITES:{limit:async()=>({success:true})},DB:{
    prepare(sql){
      const stmt=db.prepare(sql);
      function bound(args){
        return {
          bind:(...next)=>bound(next),
          first:async column=>{const row=stmt.get(...args);return (column?row?.[column]:row)??null;},
          run:async()=>({meta:{changes:stmt.run(...args).changes}})
        };
      }
      return bound([]);
    },
    batch:async statements=>Promise.all(statements.map(stmt=>stmt.run()))
  }};
  const original=Object.getOwnPropertyDescriptor(globalThis,'caches');
  Object.defineProperty(globalThis,'caches',{configurable:true,value:{default:{delete:async()=>true}}});
  t.after(()=>{if(original)Object.defineProperty(globalThis,'caches',original);else delete globalThis.caches;});
  let now=Date.parse('2026-11-21T20:59:59Z');
  t.mock.method(Date,'now',()=>now);
  const ctx={waitUntil(){}};
  async function send(actor,path,method='POST',body={}){
    const response=await worker.fetch(new Request(origin+'/api/pano'+path,{
      method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:'sofra-pano-dev='+actor.repeat(64)},
      ...(method==='GET'?{}:{body:JSON.stringify(body)})
    }),env,ctx);
    return {status:response.status,data:await response.json()};
  }
  const input={title:'Test sofrası',recipe:emptyRecipe(),pose:{yaw:0,elevation:1}};
  const publish=()=>send('a','','POST',input);
  const first=await publish();assert.equal(first.status,201);
  const post='/'+first.data.id,vote=actor=>send(actor,post+'/vote');
  const scores=()=>Object.fromEntries(db.prepare('SELECT period,total FROM scores').all().map(r=>[r.period,r.total]));
  const used=(kind,day)=>db.prepare('SELECT used FROM daily_usage WHERE bucket=? AND day=?').get(kind,day)?.used??0;
  assert.equal((await publish()).data.created,false);
  assert.equal((await vote('a')).status,403);
  assert.equal((await vote('b')).status,200);assert.equal((await vote('b')).status,200);
  now+=1000; // Sunday 00:00 in Istanbul
  await worker.scheduled({scheduledTime:now},env);
  assert.equal((await vote('b')).status,200);
  assert.deepEqual(scores(),{all:2,'d:2026-11-22':1,'w:2026-11-16':2});
  db.exec('UPDATE posts SET hidden=1');
  assert.equal((await vote('c')).status,404);assert.equal((await publish()).status,409);
  db.exec('UPDATE posts SET hidden=0');
  assert.equal((await vote('c')).status,200);
  now+=86400000; // Monday 00:00 in Istanbul
  assert.equal((await vote('b')).status,200);
  await worker.scheduled({scheduledTime:now},env);
  assert.deepEqual(scores(),{all:4,'d:2026-11-23':1,'w:2026-11-23':1});
  assert.equal((await vote('b')).status,200);
  assert.equal(used('vote','2026-11-23'),1);
  assert.equal((await send('b',post,'DELETE')).status,403);
  assert.equal((await send('a',post,'DELETE')).status,200);
  assert.equal((await vote('b')).status,404);
  assert.deepEqual(scores(),{});assert.equal(used('vote','2026-11-23'),1);
  assert.equal((await publish()).status,201);assert.equal((await vote('b')).status,200);
  assert.equal(used('vote','2026-11-23'),2);
  assert.deepEqual(scores(),{all:1,'d:2026-11-23':1,'w:2026-11-23':1});
});
