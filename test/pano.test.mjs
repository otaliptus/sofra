import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {calendar,normalizePost} from '../worker/index.js';
import {emptyRecipe,readRecipe,shareableRecipe} from '../recipe.js';
import {readTable} from '../model.js';

function migrate(db,name){
  db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
}

test('Istanbul voting day and Monday week change at local midnight',()=>{
  assert.deepEqual(calendar(Date.parse('2026-11-22T20:59:59Z')),{day:'2026-11-22',week:'2026-11-16'});
  assert.deepEqual(calendar(Date.parse('2026-11-22T21:00:00Z')),{day:'2026-11-23',week:'2026-11-23'});
});
test('shared recipes accept catalogue strings and bounded painting work',()=>{
  const recipe=emptyRecipe();
  assert.equal(readRecipe({...recipe,bread:['simit']}),null);
  assert.equal(readRecipe({...recipe,pieces:[{food:['muz'],x:0,z:0,a:0}]}),null);
  const line=Array.from({length:160},(_,i)=>i%2?[0,0]:[1024,1024]);
  assert.equal(shareableRecipe({...recipe,strokes:[{food:'cream',line}]}),null);
  assert.equal(readTable({v:1,cloth:['brick'],dishes:[]}),null);
  assert.equal(readRecipe({...recipe,bread:undefined}).bread,'simit');
  const input={title:'  Simit  sofram ',pose:{yaw:0,elevation:1},recipe};
  assert.equal(normalizePost(input).title,'Simit sofram');
  assert.throws(()=>normalizePost({...input,pose:{}}));
});
test('votes are atomic, credited to the vote date, immutable on retry and removed with the post',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0001_pano','0002_storage_budget','0003_browser_post_limit'])migrate(db,name);
  const put=db.prepare('INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
  put.run('p','author','Kahvaltı','{}',1,'2026-11-01','net');
  const vote=db.prepare('INSERT INTO votes VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING');
  const cast=(who,day,week)=>vote.run('p',who,day,week,'net');
  cast('a','2026-11-22','2026-11-16');cast('a','2026-11-22','2026-11-16');
  cast('a','2026-11-23','2026-11-23');cast('b','2026-11-23','2026-11-23');
  const scores=Object.fromEntries(db.prepare('SELECT period,total FROM scores').all().map(s=>[s.period,s.total]));
  assert.deepEqual(scores,{'all':3,'d:2026-11-22':1,'d:2026-11-23':2,'w:2026-11-16':1,'w:2026-11-23':2});
  db.prepare("UPDATE daily_usage SET used=ceiling WHERE day=? AND bucket='vote'").run('2026-11-23');
  assert.throws(()=>cast('c','2026-11-23','2026-11-23'),/board_daily_limit/);
  assert.equal(db.prepare("SELECT total FROM scores WHERE period='all'").get().total,3);
  db.exec("DELETE FROM posts WHERE id='p'");
  for(const table of ['votes','scores'])assert.equal(db.prepare('SELECT count(*) AS c FROM '+table).get().c,0);
  assert.equal(db.prepare('SELECT bytes FROM board_size').get().bytes,0);
  db.close();
});

test('publishing allows ten per browser per day, including mid-day upgrades',()=>{
  const db=new DatabaseSync(':memory:');
  migrate(db,'0001_pano');
  migrate(db,'0002_storage_budget');
  const publish=db.prepare('INSERT INTO posts VALUES (?, ?, ?, ?, 1, ?, ?, 0) ON CONFLICT(id) DO NOTHING');
  const post=(id,owner='author',day='2026-11-25')=>publish.run(id,owner,'Sofram','{}',day,'wifi');
  for(let i=1;i<=5;i++)post('p'+i);
  assert.throws(()=>post('p6'),/board_daily_limit/);
  migrate(db,'0003_browser_post_limit');
  for(let i=6;i<=10;i++)post('p'+i);
  assert.equal(post('p10').changes,0);
  db.exec("DELETE FROM posts WHERE id='p1'");
  assert.throws(()=>post('p11'),/board_daily_limit/);
  for(let i=1;i<=8;i++)post('other'+i,'neighbor');
  assert.throws(()=>post('other9','neighbor'),/board_daily_limit/);
  assert.equal(post('p11','author','2026-11-26').changes,1);
  db.close();
});
