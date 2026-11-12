import { readFile, cp, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const task=join(root,'tasks/cookie-migration');
export const baseline=join(task,'baseline');
export const manifest=JSON.parse(await readFile(join(task,'manifest.json'),'utf8'));
export const sha = data=>createHash('sha256').update(data).digest('hex');
export async function checkBaseline() {
  const expected=JSON.parse(await readFile(join(task,'baseline-hashes.json'),'utf8'));
  for(const [path,digest] of Object.entries(expected)) if(sha(await readFile(join(baseline,path)))!==digest) throw new Error(`Baseline hash mismatch: ${path}`);
  const { readdir }=await import('node:fs/promises');
  async function files(dir, prefix='') { let found=[]; for(const entry of await readdir(dir,{withFileTypes:true})) {const path=prefix ? `${prefix}/${entry.name}` : entry.name; if(entry.isSymbolicLink()) throw new Error('Baseline contains a symlink'); if(entry.isDirectory()) found.push(...await files(join(dir,entry.name),path)); else if(entry.isFile()) found.push(path); else throw new Error('Unexpected baseline entry');} return found; }
  const actual=await files(baseline); if(actual.length!==Object.keys(expected).length || actual.some(path=>!Object.hasOwn(expected,path))) throw new Error('Baseline file set mismatch');
}
export async function prepare(destination) {
  await checkBaseline();
  try { await access(destination); throw new Error('Destination already exists'); } catch(e) { if(e.code!=='ENOENT') throw e; }
  await cp(baseline,destination,{recursive:true,errorOnExist:true,force:false});
  await cp(join(task,'task.md'),join(destination,'TASK.md'));
}
export async function applyPatch(directory,patchPath) {
  const bytes=await readFile(patchPath); if(bytes.length>1024*1024 || bytes.includes(0)) throw new Error('Patch is binary or exceeds 1 MiB');
  const text=bytes.toString('utf8');
  if (/^(?:new file mode|deleted file mode|old mode|new mode|rename from|rename to|copy from|copy to|GIT binary patch|Binary files )/m.test(text)) throw new Error('File creation, removal, mode changes, renames and binary patches are not allowed');
  let result;
  try { result=execFileSync('git',['apply','--numstat','-z',resolve(patchPath)],{cwd:directory,encoding:'utf8',maxBuffer:2*1024*1024}); } catch { throw new Error('Patch cannot be parsed'); }
  const entries=result.split('\0').filter(Boolean); if(!entries.length) throw new Error('Patch is empty');
  for(const entry of entries) { const parts=entry.split('\t'); if(parts.length!==3 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1]) || !manifest.allowed_paths.includes(parts[2])) throw new Error('Patch modifies a disallowed path'); }
  try { execFileSync('git',['apply','--check',resolve(patchPath)],{cwd:directory,stdio:'pipe'});execFileSync('git',['apply',resolve(patchPath)],{cwd:directory,stdio:'pipe'}); } catch { throw new Error('Patch does not apply cleanly'); }
  return sha(bytes);
}
