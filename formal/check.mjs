import {breadCases} from './bread-cases.mjs';
import {copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {photoEdges,detailEdges,radioEdges,finishGesture,gestureOwners} from '../workflows.js';

const here=fileURLToPath(new URL('.',import.meta.url));
if(!process.env.TLA2TOOLS_JAR)throw Error('Set TLA2TOOLS_JAR to the path to tla2tools.jar (tested with TLC 1.7.4).');
const jar=resolve(process.env.TLA2TOOLS_JAR);
const dir=await mkdtemp(join(tmpdir(),'sofra-tlc-'));
const quote=JSON.stringify;
function edgeSet(edges){
  return '{'+Object.entries(edges).flatMap(([from,events])=>Object.entries(events).map(
    ([event,to])=>'<<'+[from,event,to].map(x=>quote(x)).join(',')+'>>'
  )).join(',\n')+'}';
}
function pointerCases(){
  const rows=[];
  for(const kind of Object.keys(gestureOwners)){
    for(const surface of ['canvas','handle','shelf','drink','slider']){
      for(const same of [true,false]){
        for(const type of ['pointerup','pointercancel','lostpointercapture','pointermove']){
          const result=finishGesture({kind,id:1},surface,{pointerId:same?1:2,type});
          if(result)rows.push('<<kind,surface,same,event>> = <<'+
            [quote(kind),quote(surface),same?'TRUE':'FALSE',quote(type)].join(',')+'>> -> '+quote(result));
        }
      }
    }
  }
  return 'CASE '+rows.join('\n [] ')+'\n [] OTHER -> "ignore"';
}
try{
  await writeFile(join(dir,'BreadRuns.tla'),breadCases());
  await writeFile(join(dir,'RuntimeTables.tla'),[
    '--------------------------- MODULE RuntimeTables ---------------------------',
    'PhotoEdges == '+edgeSet(photoEdges),'DetailEdges == '+edgeSet(detailEdges),
    'RadioEdges == '+edgeSet(radioEdges),'PointerResult(kind,surface,same,event) == '+pointerCases(),'============================================================================='
  ].join('\n'));
  for(const [model,config] of [['Workflow','Photo'],['Workflow','Detail'],['Gesture','Gesture'],['Radio','Radio'],['Bread','Bread'],['Ledger','Ledger']]){
    await copyFile(join(here,model+'.tla'),join(dir,model+'.tla'));
    await copyFile(join(here,config+'.cfg'),join(dir,config+'.cfg'));
    const negative=process.argv.includes('--negative-control')&&config==='Photo';
    if(negative){
      const path=join(dir,model+'.tla'),original=await readFile(path,'utf8');
      await writeFile(path,original.replace('IF owner = i /\\ phase = e[1]','IF phase = e[1]'));
    }
    await mkdir(join(dir,config+'-states'));
    const run=spawnSync(process.env.JAVA||'java',[
      '-XX:+UseParallelGC','-cp',jar,'tlc2.TLC','-workers','1','-metadir',config+'-states','-config',config+'.cfg',model
    ],{cwd:dir,encoding:'utf8',maxBuffer:8*1024*1024});
    if(run.error)throw run.error;
    console.log('\n'+config+'\n'+run.stdout+run.stderr);
    if(negative){
      if(run.status===0||!run.stdout.includes('VisitSafety is violated'))throw Error('Expected a stale-visit counterexample');
      console.log('Negative control detected the stale completion as expected.');
    }else if(run.status!==0)throw Error('TLC failed on '+config);
  }
}finally{await rm(dir,{recursive:true,force:true});}
