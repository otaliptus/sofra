import assert from 'node:assert/strict';

// Find the rendered contour through the actual hover UI, then send native
// touch input at both sides of it. Coordinates follow the live viewport.
export async function checkPicking(browser,base){
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  try{
    const page=await ctx.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    async function load(foods,baseRemoved=true){
      const recipe={v:2,bread:'simit',cloth:'kareli',baseRemoved,coverRemoved:true,strokes:[],
        pieces:foods.map(food=>({food,x:0,z:0,a:0,dem:0,water:0}))};
      await page.evaluate(r=>localStorage.setItem('sofra.simit.workbench.v2',JSON.stringify(r)),recipe);
      await page.reload();await ready();
    }
    const ready=()=>page.waitForFunction(()=>window.render_game_to_text&&JSON.parse(render_game_to_text()).ready);
    const state=()=>page.evaluate(()=>JSON.parse(render_game_to_text()));
    await page.goto(base.href);await ready();await load(['white-cheese']);
    const canvas=page.locator('#scene'),box=await canvas.boundingBox();
    const cx=Math.round(box.x+box.width/2),cy=Math.round(box.y+box.height/2);
    // Scan the center column from the front of the food towards the back.
    const front=kind=>canvas.evaluate((el,{cx,cy,kind})=>{
      for(let y=cy+95;y>=cy-95;y--){
        el.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:cx,clientY:y}));
        if(el.dataset.cursor===kind)return y;
      }
      throw Error('No visible '+kind+' surface.');
    },{cx,cy,kind});
    const rim=await front('move'),outside={x:cx,y:rim+3};
    await page.mouse.click(outside.x,outside.y);assert.equal((await state()).selected,-1);
    await page.touchscreen.tap(outside.x,outside.y);assert.equal((await state()).selected,0);
    await page.touchscreen.tap(cx,rim+11);assert.equal((await state()).selected,-1);

    const origin=(await state()).camera;
    const cdp=browser.browserType().name()==='chromium'?await ctx.newCDPSession(page):null;
    // Playwright supports native taps on both engines and native touch moves via CDP.
    async function drag(type,point){
      if(cdp)return cdp.send('Input.dispatchTouchEvent',{type,touchPoints:point?[point]:[]});
      if(point)await page.mouse.move(point.x,point.y);
      if(type==='touchStart')await page.mouse.down();
      else if(type==='touchEnd')await page.mouse.up();
    }
    await drag('touchStart',outside);await drag('touchMove',{x:cx+35,y:outside.y+48});
    await page.waitForFunction(yaw=>JSON.parse(render_game_to_text()).camera.yaw!==yaw,origin.yaw);
    await drag('touchEnd');assert.equal((await state()).selected,-1);

    await page.mouse.move(cx,cy);await page.mouse.down({button:'right'});
    await page.mouse.move(cx,cy+box.height*.37,{steps:4});await page.mouse.up({button:'right'});
    const edge=await front('move');
    await page.locator('[data-food=cream]').click();await page.waitForFunction(()=>JSON.parse(render_game_to_text()).brush==='cream');
    const paint=await front('spread');
    assert.ok(edge>paint+1,'a visible vertical cheese face extends below the paint surface');
    await page.touchscreen.tap(cx,edge-1);
    assert.equal((await state()).pieces[0].marks?.length??0,0);
    await canvas.press('Escape');
    const pose=(await state()).camera;
    await drag('touchStart',{x:cx,y:edge-1});assert.equal((await state()).gesture,'piece');
    await drag('touchMove',{x:cx+12,y:edge-1});await drag('touchEnd');
    assert.notEqual((await state()).pieces[0].x,0);
    // The browser may deliver a compatibility double-click on the empty canvas
    // immediately after a quick release. Reproduce it independently of timing.
    await canvas.dispatchEvent('dblclick',{clientX:cx,clientY:box.y+20});
    assert.deepEqual((await state()).camera,pose);
    await page.locator('#undo-action').click();assert.equal((await state()).pieces[0].x,0);
    await page.mouse.dblclick(cx,box.y+20);
    assert.deepEqual((await state()).camera,{yaw:0,elevation:Math.PI/2});

    await load(['black-ring']);
    const hole=await canvas.evaluate((el,{cx,cy})=>{
      for(let offset=0;offset<=30;offset++){
        const y=cy+(offset%2?1:-1)*Math.ceil(offset/2);
        let entered=false,gap=null;
        for(let x=cx-28;x<=cx+28;x++){
          el.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:x,clientY:y}));
          if(el.dataset.cursor==='move'){
            if(gap)return gap;
            entered=true;
          }else if(entered&&!gap)gap={x,y};
        }
      }
    },{cx,cy});
    assert.ok(hole,'found the inner edge of the olive');
    await page.touchscreen.tap(hole.x,hole.y);assert.equal((await state()).selected,-1);
    await load([],false);
    await page.touchscreen.tap(cx,cy);assert.equal((await state()).selected,-1,'tap through the simit hole');
    await load(['tomato','black-ring']);
    await page.touchscreen.tap(cx,cy);assert.equal((await state()).selected,0,'tomato visible through the olive');
    assert.deepEqual(errors,[]);
    console.log('Picking: cheese edge drag and undo, precise spread, forgiving touch tap, cloth orbit and visible food through holes passed.');
  }finally{await ctx.close();}
}
