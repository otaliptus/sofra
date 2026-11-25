import test from 'node:test';
import assert from 'node:assert/strict';
import {workflow,photoEdges,detailEdges,radioEdges} from '../workflows.js';

for(const [name,edges] of Object.entries({photo:photoEdges,detail:detailEdges,radio:radioEdges})){
  test(name+' accepts exactly its declared events and invalidates callbacks on same-phase reentry',()=>{
    const paths=new Map([['idle',[]]]);
    for(const [state,path] of paths){
      for(const [event,next] of Object.entries(edges[state])){
        if(!paths.has(next))paths.set(next,[...path,event]);
      }
    }
    assert.deepEqual([...paths.keys()].sort(),Object.keys(edges).sort());
    const events=new Set(Object.values(edges).flatMap(out=>Object.keys(out)));
    for(const [state,path] of paths){
      for(const event of events){
        const model=workflow(edges);
        for(const step of path)model.send(step);
        const stale=model.visit;
        model.send('dismiss');
        for(const step of path)model.send(step);
        assert.equal(model.send(event,stale),null);
        assert.equal(model.state,state);
        const current=model.visit,next=edges[state][event],result=model.send(event,current);
        assert.equal(model.state,next??state);
        if(next){assert.equal(result,model.visit);assert.notEqual(result,current);}
        else{assert.equal(result,null);assert.equal(model.visit,current);}
      }
    }
  });
}
