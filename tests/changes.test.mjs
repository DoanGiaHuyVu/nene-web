import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChanges, isChanges, patchLineClass } from '../app/lib/changes.ts';

const data={taskId:'test-run',initialBuild:true,summary:{filesChanged:0,additions:0,deletions:0,countsComplete:true},files:[],truncated:false,omittedFiles:0};

test('lazy diff requests use the task ID and reject wrong revision responses',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(...args)=>{calls.push(args);return Response.json(data);});
  const signal=new AbortController().signal;
  assert.equal((await loadChanges('test-run',signal)).taskId,'test-run');
  assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/tasks/test-run/changes');
  assert.equal(calls[0][1].signal,signal);assert.equal(calls[0][1].cache,'no-store');
  await assert.rejects(loadChanges('other-run',signal),/Could not load changes/);
});

test('failed requests, malformed diffs, and cancellation do not produce a review',async t=>{
  const signal=new AbortController().signal;
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:'Internal details'},{status:500}));
  await assert.rejects(loadChanges('test-run',signal),/Could not load changes/);
  globalThis.fetch=async()=>Response.json({taskId:'test-run',files:null});
  await assert.rejects(loadChanges('test-run',signal),/Could not load changes/);
  globalThis.fetch=async()=>{throw new DOMException('Aborted','AbortError');};
  await assert.rejects(loadChanges('test-run',signal),e=>e.name==='AbortError');
});

test('diff metadata validation and patch colors keep source as ordinary text',()=>{
  assert.equal(isChanges(data),true);assert.equal(isChanges({...data,files:[{path:'app/x',status:'unknown'}]}),false);
  assert.match(patchLineClass('+<script>'),/green/);assert.match(patchLineClass('-old'),/red/);
  assert.match(patchLineClass('@@ -1 +1 @@'),/sky/);assert.match(patchLineClass(' context'),/neutral/);
});
