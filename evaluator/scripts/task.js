import { readFile, cp, access, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const sha=data=>createHash('sha256').update(data).digest('hex');
export async function loadTask(id='cookie-migration') {
  if(!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid task ID');
  const path=join(root,'tasks',id), manifest=JSON.parse(await readFile(join(path,'manifest.json'),'utf8'));
  if(manifest.id!==id || !Array.isArray(manifest.allowed_paths)) throw new Error('Invalid task manifest');
  return {id,path,manifest,baseline:join(path,'baseline')};
}
export async function checkBaseline(id='cookie-migration') {
  const {path,baseline}=await loadTask(id);
  const expected=JSON.parse(await readFile(join(path,'baseline-hashes.json'),'utf8'));
  for(const [file,digest] of Object.entries(expected)) if(sha(await readFile(join(baseline,file)))!==digest) throw new Error(`Baseline hash mismatch: ${file}`);
  async function files(dir,prefix='') { let found=[]; for(const entry of await readdir(dir,{withFileTypes:true})) {const file=prefix?`${prefix}/${entry.name}`:entry.name; if(entry.isSymbolicLink()) throw new Error('Baseline contains a symlink'); if(entry.isDirectory()) found.push(...await files(join(dir,entry.name),file)); else if(entry.isFile()) found.push(file); else throw new Error('Unexpected baseline entry');} return found; }
  const actual=await files(baseline); if(actual.length!==Object.keys(expected).length || actual.some(file=>!Object.hasOwn(expected,file))) throw new Error('Baseline file set mismatch');
}
export async function prepare(destination,id='cookie-migration') {
  const task=await loadTask(id); await checkBaseline(id);
  try { await access(destination); throw new Error('Destination already exists'); } catch(e) { if(e.code!=='ENOENT') throw e; }
  await cp(task.baseline,destination,{recursive:true,errorOnExist:true,force:false});
  await cp(join(task.path,'task.md'),join(destination,'TASK.md'));
}
export async function applyPatch(directory,patchPath,id='cookie-migration') {
  const {manifest}=await loadTask(id); const bytes=await readFile(patchPath); if(bytes.length>1024*1024 || bytes.includes(0)) throw new Error('Patch is binary or exceeds 1 MiB');
  const text=bytes.toString('utf8');
  if (/^(?:new file mode|deleted file mode|old mode|new mode|rename from|rename to|copy from|copy to|GIT binary patch|Binary files )/m.test(text)) throw new Error('File creation, removal, mode changes, renames and binary patches are not allowed');
  let result;
  try { result=execFileSync('git',['apply','--numstat','-z',resolve(patchPath)],{cwd:directory,encoding:'utf8',maxBuffer:2*1024*1024}); } catch { throw new Error('Patch cannot be parsed'); }
  const entries=result.split('\0').filter(Boolean); if(!entries.length) throw new Error('Patch is empty');
  for(const entry of entries) { const parts=entry.split('\t'); if(parts.length!==3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1]) || !manifest.allowed_paths.includes(parts[2])) throw new Error('Patch modifies a disallowed path'); }
  try { execFileSync('git',['apply','--check',resolve(patchPath)],{cwd:directory,stdio:'pipe'});execFileSync('git',['apply',resolve(patchPath)],{cwd:directory,stdio:'pipe'}); } catch { throw new Error('Patch does not apply cleanly'); }
  return sha(bytes);
}
