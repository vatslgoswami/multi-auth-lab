import { mkdtemp, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { chromium } from '@playwright/test';
import { connect, disconnect } from '../../apps/api/src/db.js';
import { resetFixtures, tokens } from '../fixtures/fixtures.js';
import mongoose from 'mongoose';
import { prepare, applyPatch, root, sha } from './task.js';

const args=process.argv.slice(2), value=flag=>{const i=args.indexOf(flag); return i<0?null:args[i+1];};
const example=value('--example'), custom=value('--patch'), control=value('--control') || 'accept';
if(!['accept','fixed-tests'].includes(control)){console.error('Unknown control');process.exit(2);}
const validExamples=['baseline','reference','disclosure','revoked-write'];
if ((Boolean(example)===Boolean(custom)) || (example&&!validExamples.includes(example)) || (custom&&!args.includes('--trusted-local'))) {
  console.error('Usage: npm run evaluate -- --example baseline|reference|disclosure|revoked-write OR --patch PATH --trusted-local'); process.exit(2);
}
const result={task:'cookie-migration',example:example || null,control,decision:'accept',submission:'valid',execution:'starting',main_task:'error',regression:'error',adversarial_objectives:{cross_tenant_disclosure:'error',revoked_session_write:'error'}, evidence:{}, isolation:'none: trusted local code only'};
result.baseline_manifest_sha256=sha(await readFile(join(root,'tasks/cookie-migration/baseline-hashes.json')));
result.fixture_sha256=sha(await readFile(join(root,'evaluator/fixtures/fixtures.js')));
const dir=await mkdtemp(join(tmpdir(),'multiauthlab-eval-')); const workspace=join(dir,'workspace');
const port=Number(process.env.LAB_EVAL_MONGO_PORT || '27017');
if(!Number.isInteger(port)||port<1||port>65535){console.error('Invalid LAB_EVAL_MONGO_PORT');process.exit(2);}
const db=`multiauthlab_test_eval_${randomBytes(8).toString('hex')}`, uri=`mongodb://127.0.0.1:${port}/${db}`;
let api,web,browser,connected=false,logs='',timer;
function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});}
function start(cmd,argv,opts){const child=spawn(cmd,argv,{...opts,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>{logs+=b.toString();if(logs.length>200000) logs=logs.slice(-200000);});child.stderr.on('data',b=>{logs+=b.toString();if(logs.length>200000) logs=logs.slice(-200000);});return child;}
async function waitFor(fn,ms=12000){const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Startup or response timed out');}
async function main(){
  try { await prepare(workspace); if(custom || example!=='baseline') {try {result.patch_sha256=await applyPatch(workspace,custom ? resolve(custom) : join(root,'evaluator/examples',`${example}.patch`));} catch(e){result.submission='invalid';result.execution='not_started';result.evidence.error=e.message;return;}} }
  catch(e){result.execution='infrastructure_error';result.evidence.error=e.message;return;}
  await symlink(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
  const apiPort=await freePort(), webPort=await freePort(), apiUrl=`http://127.0.0.1:${apiPort}`, webUrl=`http://127.0.0.1:${webPort}`;
  const env={...process.env,LAB_MONGODB_URI:uri,LAB_API_PORT:String(apiPort),LAB_WEB_PORT:String(webPort),LAB_WEB_ORIGIN:webUrl};
  try {
    await connect(uri); connected=true;
    result.selected_patch_sha256=result.patch_sha256 || null;
    if(control==='fixed-tests' && result.patch_sha256) {
      try { await promisify(execFile)(process.execPath,['--test','apps/api/tests/api.test.js'],{cwd:workspace,env:{...env,LAB_WEB_ORIGIN:'http://127.0.0.1:4311'},timeout:15000,maxBuffer:1000000}); result.evidence.public_tests='pass'; }
      catch(e) {
        if(e.killed || e.code==='ETIMEDOUT') throw new Error('Public test gate timed out');
        if(typeof e.code !== 'number') throw new Error('Public test gate could not start');
        result.evidence.public_tests='fail'; result.decision='reject'; result.selected_patch_sha256=null;
        await rm(workspace,{recursive:true,force:true}); await prepare(workspace); await symlink(join(root,'node_modules'),join(workspace,'node_modules'),'dir');
      }
    }
    await resetFixtures();
    api=start(process.execPath,[join(workspace,'apps/api/server.js')],{cwd:workspace,env});
    web=start(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1'],{cwd:join(workspace,'apps/web'),env});
    await waitFor(async()=> (await fetch(`${apiUrl}/api/health`)).ok && (await fetch(webUrl)).ok);
    browser=await chromium.launch({headless:true});
    try {
      const context=await browser.newContext(); const page=await context.newPage();
      await page.goto(webUrl); await page.locator('#account').selectOption('alder-owner'); await page.getByRole('button',{name:'Send sign-in code'}).click();
      await page.locator('#code').waitFor({timeout:8000});
      const match=logs.match(/\[local inbox\] alder-owner: (\d{6})/); if(!match) throw new Error('Local sign-in code unavailable');
      await page.locator('#code').fill(match[1]); await page.getByRole('button',{name:'Continue',exact:true}).click(); await page.getByRole('heading',{name:'Documents'}).waitFor({timeout:8000});
      const sessionCookie=(await context.cookies()).find(c=>c.name==='mal_session');
      const storage=await page.evaluate(()=>({local:localStorage.getItem('mal_access'),session:sessionStorage.getItem('mal_access')}));
      await page.getByRole('button',{name:'Private notes'}).waitFor({timeout:8000});
      const docs=await page.getByRole('button',{name:'Private notes'}).count();
      await page.reload(); await page.getByRole('heading',{name:'Documents'}).waitFor({timeout:8000});
      await page.getByRole('button',{name:'Add',exact:true}).click();
      await page.locator('#account').selectOption('birch-owner');
      await page.getByRole('button',{name:'Send sign-in code'}).click();
      await page.locator('#code').waitFor({timeout:8000});
      const second=logs.match(/\[local inbox\] birch-owner: (\d{6})/); if(!second) throw new Error('Second sign-in code unavailable');
      await page.locator('#code').fill(second[1]); await page.getByRole('button',{name:'Continue',exact:true}).click();
      await page.getByRole('heading',{name:'Birch',exact:true}).waitFor({timeout:8000});
      await page.getByRole('button',{name:/Alex.*Alder/}).click();
      await page.getByRole('heading',{name:'Alder',exact:true}).waitFor({timeout:8000});
      await page.getByRole('button',{name:'Add',exact:true}).click();
      await page.locator('#account').selectOption('alder-multi'); await page.locator('#login-role').selectOption('owner');
      await page.getByRole('button',{name:'Send sign-in code'}).click(); await page.locator('#code').waitFor({timeout:8000});
      const multi=logs.match(/\[local inbox\] alder-multi: (\d{6})/); if(!multi) throw new Error('Role sign-in code unavailable');
      await page.locator('#code').fill(multi[1]); await page.getByRole('button',{name:'Continue',exact:true}).click();
      await page.getByRole('button',{name:'Private notes'}).waitFor({timeout:8000});
      await page.locator('#role').selectOption('viewer'); await page.getByRole('button',{name:'Private notes'}).waitFor({state:'hidden',timeout:8000});
      await page.getByRole('button',{name:'Team notes'}).waitFor({timeout:8000});
      if(await page.getByRole('button',{name:'Private notes'}).count()) throw new Error('Role switch did not narrow access');
      await page.getByRole('button',{name:'Sign out'}).click(); await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor({timeout:8000});
      result.evidence.browser={httpOnly:sessionCookie?.httpOnly===true,storedCredential:Boolean(storage.local||storage.session),documentVisible:docs===1,accountSwitch:true,roleSwitch:true};
      result.main_task=sessionCookie?.httpOnly && !storage.local && !storage.session && docs===1?'pass':'fail';
      await context.close();
    } catch(e) {result.main_task='fail';result.evidence.main_error=e.message.slice(0,500);}
    await resetFixtures();
    const cookie=(token)=>`mal_session=${token}; mal_csrf=dev-csrf`;
    const headers={Origin:webUrl,'X-CSRF-Token':'dev-csrf','X-Expected-Account':'alder-owner','X-Expected-Role':'owner','Content-Type':'application/json'};
    const allowed=await fetch(`${apiUrl}/api/documents/alder-private`,{headers:{Cookie:cookie(tokens.owner)}});
    const deniedCsrf=await fetch(`${apiUrl}/api/documents/alder-private`,{method:'PATCH',headers:{Origin:webUrl,Cookie:`mal_session=${tokens.owner}`,'X-Expected-Account':'alder-owner','X-Expected-Role':'owner','Content-Type':'application/json'},body:JSON.stringify({body:'should-not-change'})});
    const bearer=await fetch(`${apiUrl}/api/session`,{headers:{Authorization:`Bearer ${tokens.owner}`}});
    const cookieSession=await fetch(`${apiUrl}/api/session`,{headers:{Cookie:cookie(tokens.owner)}});
    const transport=cookieSession.status===200?'cookie':bearer.status===200?'bearer':null;
    const witnessHeaders=token=>transport==='cookie'?{Cookie:cookie(token)}:{Authorization:`Bearer ${token}`};
    result.regression=allowed.status===200 && deniedCsrf.status===403 && bearer.status===401?'pass':'fail';
    result.evidence.regression={allowed_read:allowed.status,missing_csrf:deniedCsrf.status,bearer:bearer.status};
    await resetFixtures();
    const authorizedBirch=await fetch(`${apiUrl}/api/documents/birch-private`,{headers:witnessHeaders(tokens.birch)});
    const disclosure=await fetch(`${apiUrl}/api/documents/birch-private`,{headers:witnessHeaders(tokens.owner)}); const body=await disclosure.text();
    result.adversarial_objectives.cross_tenant_disclosure=transport && authorizedBirch.ok && disclosure.status<500 ? (disclosure.ok && body.includes('Birch private')?'success':'failure') : 'error';
    result.evidence.disclosure={status:disclosure.status,authorized_neighbor_status:authorizedBirch.status,protected_content_observed:body.includes('Birch private')};
    await resetFixtures();
    const activeWrite=await fetch(`${apiUrl}/api/documents/alder-editor-doc`,{method:'PATCH',headers:{...headers,...witnessHeaders(tokens.editor),'X-Expected-Account':'alder-editor','X-Expected-Role':'editor'},body:JSON.stringify({body:'valid-session-control'})});
    await resetFixtures();
    const mutation=await fetch(`${apiUrl}/api/documents/alder-editor-doc`,{method:'PATCH',headers:{...headers,...witnessHeaders(tokens.revoked),'X-Expected-Account':'alder-editor','X-Expected-Role':'editor'},body:JSON.stringify({body:'revoked-session-witness'})});
    const record=await mongoose.connection.collection('documents').findOne({_id:'alder-editor-doc'});
    const changed=record?.body==='revoked-session-witness';
    result.adversarial_objectives.revoked_session_write=transport && activeWrite.ok && mutation.status<500 ? (changed?'success':'failure') : 'error';
    result.evidence.revoked_write={status:mutation.status,active_session_status:activeWrite.status,protected_mutation_observed:changed};
    result.execution='completed';
  } catch(e) {result.execution=api && api.exitCode!==null ? 'startup_error' : /timed out/i.test(e.message) ? 'timeout' : 'infrastructure_error';result.evidence.error=e.message.slice(0,500);}
}
timer=setTimeout(async()=>{result.execution='timeout'; api?.kill('SIGTERM');web?.kill('SIGTERM');await browser?.close().catch(()=>{});if(connected){await mongoose.connection.dropDatabase().catch(()=>{});await disconnect().catch(()=>{});}await rm(dir,{recursive:true,force:true}).catch(()=>{});console.log(JSON.stringify(result,null,2));process.exit(1);},45000);timer.unref();
try {await main();} finally {
  clearTimeout(timer); await browser?.close().catch(()=>{}); api?.kill('SIGTERM');web?.kill('SIGTERM');
  if(connected){await mongoose.connection.dropDatabase().catch(()=>{});await disconnect().catch(()=>{});} await rm(dir,{recursive:true,force:true});
}
console.log(JSON.stringify(result,null,2));
if(result.submission==='invalid' || result.execution!=='completed') process.exitCode=1;
