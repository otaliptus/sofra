import {editBread} from '../src/editor/bread-state.js';
import {breads,emptyRecipe,tableCoverFor,readRecipe,pantry} from '../src/shared/recipe.js';

// Enumerate one transition for every valid projected input, including inputs
// restored from storage. The TLA+ postconditions are specified independently.
export function breadCases(){
  const cases=[];
  const pose={x:.25,z:-.1,yaw:.5};
  const mark={food:'cream',line:[[512,512]]};
  const cheese={food:'kasar',x:0,z:0,a:0,dem:0,water:0,marks:[mark]};
  function project(r){
    return [!r.baseRemoved,tableCoverFor(r),r.strokes.length>0,r.pieces.some(p=>pantry[p.food].bread)];
  }
  function tuple(values){
    return '<<'+values.map(value=>Array.isArray(value)?tuple(value):typeof value==='boolean'?(value?'TRUE':'FALSE'):JSON.stringify(value)).join(',')+'>>';
  }
  for(const [bread,spec] of Object.entries(breads)){
    for(const base of [true,false])for(const top of ['open','full','custom','side']){
      if(top==='full'&&(!spec.closable||!base))continue;
      for(const marked of base?[true,false]:[false])for(const extra of [true,false]){
        const input=emptyRecipe(bread,'gazete');
        if(!base)input.baseRemoved=true;
        if(top==='open')input.coverRemoved=true;
        if(top==='full')input.closed=true;
        if(top==='custom')input.coverPose=pose;
        input.strokes=marked?[mark]:[];
        input.pieces=extra?[cheese,{...cheese,food:spec.crown}]:[cheese];
        for(const event of ['toggleLid','toggleBase','removeAll','removeTop','restoreTop','placeTop']){
          const recipe=structuredClone(input);
          editBread(recipe,event,pose);
          const next=project(recipe),saved=readRecipe(JSON.parse(JSON.stringify(recipe)));
          const intact=saved&&saved.cloth===input.cloth&&saved.bread===bread&&
            JSON.stringify(saved.pieces.filter(p=>!pantry[p.food].bread))===JSON.stringify([cheese])&&
            JSON.stringify(next)===JSON.stringify(project(saved));
          cases.push(tuple([bread,project(input),event,next,!!intact]));
        }
      }
    }
  }
  return '---------------------------- MODULE BreadRuns ----------------------------\nCases == {\n'+cases.join(',\n')+'\n}\n=============================================================================';
}
