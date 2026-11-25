// Check event delivery in a real browser. All board API calls are intercepted.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const base=new URL(process.env.SOFRA_LOCAL_URL||'http://127.0.0.1:4211');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(base.hostname));
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:900,height:720}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const open=IDBFactory.prototype.open;
    IDBFactory.prototype.open=function(...args){
      if(window.failAlbumOpen&&args[0]==='sofra-simit-album'){
        window.failAlbumOpen=false;throw new DOMException('Temporary album failure','UnknownError');
      }
      return open.apply(this,args);
    };
    const completion=Object.getOwnPropertyDescriptor(IDBTransaction.prototype,'oncomplete');
    Object.defineProperty(IDBTransaction.prototype,'oncomplete',{...completion,set(listener){
      if(window.delayAlbum&&this.mode==='readwrite'&&this.objectStoreNames.contains('photos')){
        completion.set.call(this,event=>{window.finishSave=()=>listener.call(this,event);});
      }else completion.set.call(this,listener);
    }});
    const original=HTMLCanvasElement.prototype.toBlob;
    window.encodes=[];
    HTMLCanvasElement.prototype.toBlob=function(callback,type,...args){
      if(this.width===960&&type==='image/png'){
        window.encodes.push(ok=>new Promise(resolve=>{
          const done=blob=>{callback(blob);resolve();};
          if(ok)original.call(this,done,type,...args);else done(null);
        }));return;
      }
      return original.call(this,callback,type,...args);
    };
  });
  await page.goto(base.href);
  const state=(key,value)=>page.waitForFunction(([k,v])=>window.render_game_to_text&&JSON.parse(render_game_to_text())[k]===v,[key,value]);
  await state('ready',true);
  const click=id=>page.locator('#'+id).click();
  const encode=ok=>page.evaluate(async success=>{
    await window.encodes.shift()(success);await new Promise(requestAnimationFrame);
  },ok);
  await click('shutter');await click('shutter');await state('photo','encoding');
  await click('back');await click('shutter');await click('shutter');
  await encode(true);await state('photo','encoding');assert.equal(await page.locator('#sheet').isVisible(),false);
  await encode(false);await state('photo','idle');
  await click('shutter');await encode(true);await page.locator('#keep').waitFor();
  await page.evaluate(()=>{window.failAlbumOpen=true;});
  await click('keep');await state('photo','preview');
  await page.waitForFunction(()=>document.querySelector('.feedback')?.textContent.includes('kaydedilemedi'));
  await page.evaluate(()=>{window.delayAlbum=true;});
  await click('keep');await page.waitForFunction(()=>!!window.finishSave);
  await page.locator('#sheet .close').click();await state('photo','idle');
  await click('shutter');await encode(true);await page.locator('#keep').waitFor();
  await page.evaluate(()=>{window.delayAlbum=false;window.finishSave();});
  assert.equal(await page.locator('#keep').isVisible(),true);
  await click('keep');await page.locator('#remix').waitFor();
  await page.locator('#sheet .close').click();await state('photo','idle');
  await click('back');await click('album');await page.locator('.gallery button').first().click();
  await click('hang');
  const id='a'.repeat(32);
  await page.route('**/api/pano/session',route=>route.fulfill({json:{ok:true}}));
  let receivePublish;
  const publishing=new Promise(resolve=>{receivePublish=resolve;});
  await page.route('**/api/pano',route=>{receivePublish(route);});
  await page.locator('#hang-form [type=submit]').click();const write=await publishing;
  await click('hang-back');await state('photo','preview');
  await write.fulfill({json:{created:true,id,removeKey:'b'.repeat(64)}});
  await page.waitForLoadState('networkidle');
  await page.locator('#remix').waitFor();await page.locator('.print').evaluate(img=>img.decode());
  if(process.env.SOFRA_SCREENSHOT)await page.screenshot({path:process.env.SOFRA_SCREENSHOT});
  await page.locator('#sheet .close').click();
  const scene=page.locator('#scene'),bounds=await scene.boundingBox();
  await scene.evaluate(el=>el.addEventListener('pointerdown',e=>{window.finger=e.pointerId;},{once:true}));
  await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);
  await page.mouse.down({button:'right'});await state('gesture','orbit');
  await page.mouse.move(bounds.x+bounds.width*.52,bounds.y+bounds.height*.5);
  await scene.evaluate(el=>el.releasePointerCapture(window.finger));
  await page.mouse.move(bounds.x+bounds.width*.54,bounds.y+bounds.height*.5);
  await state('gesture',null);await page.mouse.up({button:'right'});
  await click('shutter');await state('mode','camera');
  await click('back');
  const radioState=phase=>page.waitForFunction(p=>JSON.parse(render_game_to_text()).music.phase===p,phase);
  await radioState('idle');
  assert.equal(await page.locator('#soundtrack').getAttribute('src'),null);
  // A deterministic silent track exercises Chromium's real decoder without streaming music.
  const frames=60*8000,wav=Buffer.alloc(44+frames,128);
  wav.write('RIFF');wav.writeUInt32LE(frames+36,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(8000,24);wav.writeUInt32LE(8000,28);wav.writeUInt16LE(1,32);
  wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(frames,40);
  await page.route('https://upload.wikimedia.org/**',route=>route.fulfill({contentType:'audio/wav',body:wav}));
  await click('music-toggle');await click('music-play');await radioState('playing');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await radioState('idle');assert.equal(await page.locator('#soundtrack').evaluate(a=>a.paused),true);
  await click('music-next');await radioState('idle');
  console.log('Radio: starts silent, plays after opt-in and pauses on pagehide.');
  console.log('Foto: dismissed capture, same-mode re-entry, failed encode, retry, album save/reopen and pointer capture loss passed.');

  await click('fresh');await page.locator('[data-bread="tas-ekmek"]').click();
  await click('lid');await state('closed',true);
  await click('fresh');await click('toggle-base');await state('baseRemoved',true);await state('closed',false);
  await click('fresh');await click('remove-breads');await state('coverRemoved',true);
  await click('undo-action');await state('photoCover','custom');
  await click('fresh');await click('toggle-base');await state('closed',false);
  for(const bread of ['simit','acma','pogaca']){
    await click('fresh');await page.locator('[data-bread="'+bread+'"]').click();
    await click('fresh');await click('remove-breads');await state('coverRemoved',true);
    await click('undo-action');await state('photoCover','side');
  }
  await page.locator('.food[data-food="ayran"]').click();await page.locator('#scene').press('Enter');
  await page.locator('#foil-amount').focus();await page.keyboard.press('End');
  await click('serve-drink');
  assert.equal(await page.evaluate(()=>JSON.parse(render_game_to_text()).pieces.at(-1).peel),100);
  console.log('Bread and drinks: all four loaves, removing and undoing, plus a shelf-to-plate ayran peel passed.');
  const post={id,created:Date.now(),title:'Test sofrası',total:0,mine:false,voted:false,reported:false,
    recipe:{v:2,cloth:'kareli',bread:'simit',strokes:[],pieces:[]},angle:'tilt',pose:{yaw:0,elevation:1}};
  let receiveVote,detailGets=0,reports=0;
  const voteRequest=new Promise(resolve=>{receiveVote=resolve;});
  await page.route('**/api/pano**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/vote')){receiveVote(route);return;}
    let data;
    if(url.pathname.endsWith('/session'))data={ok:true};
    else if(url.pathname.endsWith('/report')){reports++;post.reported=true;data={ok:true};}
    else if(url.pathname.endsWith(id)){detailGets++;data=post;}
    else data={posts:[post],after:null};
    await route.fulfill({json:data});
  });
  await page.goto(new URL('pano.html',base).href);
  await page.locator('.pin').first().click();await click('vote');
  const voteRoute=await voteRequest;
  await click('close');await page.locator('.pin').first().click();
  await click('report');await page.locator('#confirm-no').waitFor();
  assert.ok(voteRoute);await voteRoute.fulfill({status:429,json:{error:'Old response'}});
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#feedback').textContent(),'');
  assert.equal(await page.locator('#confirm').isVisible(),true);
  assert.equal(await page.locator('#vote').isDisabled(),true);
  await click('confirm-no');assert.equal(await page.locator('#vote').isEnabled(),true);
  await click('report');await click('confirm-yes');
  await page.waitForFunction(()=>document.querySelector('#report').textContent==='Bildirildi');
  assert.equal(reports,1);assert.equal(detailGets,3);
  assert.deepEqual(errors,[]);
  console.log('Board: same-recipe reopen, late vote failure, confirmation cancellation, report and reload passed.');
}finally{await browser.close();}
