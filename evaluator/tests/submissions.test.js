import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepare, applyPatch, root } from '../scripts/task.js';

test('task export omits evaluator and reference patch applies cleanly',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'mal-test-')); const workspace=join(dir,'workspace');
  try {await prepare(workspace);assert.match(await readFile(join(workspace,'TASK.md'),'utf8'),/cookie/i);await assert.rejects(readFile(join(workspace,'evaluator/examples/reference.patch')));assert.match(await applyPatch(workspace,join(root,'evaluator/examples/reference.patch')),/^[a-f0-9]{64}$/);await assert.rejects(prepare(workspace),/already exists/);} finally {await rm(dir,{recursive:true,force:true});}
});
test('patches modifying protected files or file modes are rejected',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'mal-test-'));const workspace=join(dir,'workspace');
  try {await prepare(workspace);const patch=join(dir,'bad.patch');await writeFile(patch,'--- a/package.json\n+++ b/package.json\n@@ -1,3 +1,3 @@\n {\n-  "name": "multi-auth-lab",\n+  "name": "changed",\n   "private": true,\n');await assert.rejects(applyPatch(workspace,patch),/disallowed/);await writeFile(patch,'diff --git a/apps/api/src/app.js b/apps/api/src/app.js\nold mode 100644\nnew mode 100755\n');await assert.rejects(applyPatch(workspace,patch),/mode changes/);} finally {await rm(dir,{recursive:true,force:true});}
});
