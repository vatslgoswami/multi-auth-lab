import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { connect, disconnect, databaseUri } from '../../api/src/db.js';
import { resetFixtures } from '../../api/src/fixtures.js';
import { createApp } from '../../api/src/app.js';
import { Session } from '../../api/src/models.js';

const inbox = new Map();
let server, vite, browser;
before(async()=>{
  if (!new URL(databaseUri()).pathname.startsWith('/multiauthlab_test_')) throw new Error('Browser tests require a dedicated test database');
  await connect(); await resetFixtures();
  server=createApp({deliverChallenge:async({account,code})=>inbox.set(account,code)}).listen(4310,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  vite=spawn(process.execPath,['../../node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:'apps/web',stdio:'pipe'});
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:4311')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));if(i===59)throw new Error('Vite failed to start');}
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();vite?.kill('SIGTERM'); if(server) await new Promise(resolve=>server.close(resolve)); await disconnect();});
async function login(page,account){
  await page.locator('#account').selectOption(account);
  await page.getByRole('button',{name:'Send sign-in code'}).click();
  await page.locator('#code').waitFor();
  await page.locator('#code').fill(inbox.get(account));
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Documents'}).waitFor();
}
test('cookies, switching, cross-tab synchronization, draft isolation and revoked reauthentication',async()=>{
  const context=await browser.newContext(); const page=await context.newPage(); await page.goto('http://127.0.0.1:4311');
  await login(page,'alder-owner');
  const cookie=await context.cookies(); assert.equal(cookie.find(c=>c.name==='mal_session').httpOnly,true); assert.equal(cookie.find(c=>c.name==='mal_session').sameSite,'Strict');
  await page.getByRole('button',{name:'Private notes'}).click(); await page.locator('#body').fill('Alder unsaved draft');
  const tab=await context.newPage(); await tab.goto('http://127.0.0.1:4311'); await tab.getByRole('heading',{name:'Documents'}).waitFor();
  await page.getByRole('button',{name:'Add',exact:true}).click(); await login(page,'birch-owner');
  await tab.getByRole('heading',{name:'Birch',exact:true}).waitFor();
  assert.equal(await tab.getByRole('button',{name:'Private notes'}).count(),0);
  await page.getByRole('button',{name:/Alex.*Alder/}).click();
  await page.getByRole('button',{name:'Private notes'}).click(); assert.equal(await page.locator('#body').inputValue(),'Alder unsaved draft');
  const stale=await page.evaluate(async()=>{ const csrf=decodeURIComponent(document.cookie.split('; ').find(c=>c.startsWith('mal_csrf='))?.slice(9)||''); return (await fetch('/api/documents/alder-private',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-Expected-Account':'birch-owner','X-Expected-Role':'owner'},body:JSON.stringify({body:'wrong account'})})).status; });
  assert.equal(stale,409);
  await Session.updateMany({account:'birch-owner'},{$set:{revokedAt:new Date()}});
  await page.reload(); await page.getByText('Birch · Sign in again').waitFor();
  await page.getByRole('button',{name:'Sign out'}).click(); await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
  await context.close();
});

test('role changes narrow access and forgetting an account revokes its session',async()=>{
  await resetFixtures();
  const context=await browser.newContext(); const page=await context.newPage(); await page.goto('http://127.0.0.1:4311');
  await page.locator('#account').selectOption('alder-multi');
  await page.locator('#login-role').selectOption('owner');
  await page.getByRole('button',{name:'Send sign-in code'}).click();
  await page.locator('#code').waitFor(); await page.locator('#code').fill(inbox.get('alder-multi'));
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Private notes'}).waitFor();
  await page.locator('#role').selectOption('viewer');
  await page.getByRole('heading',{name:'Documents'}).waitFor();
  await page.waitForFunction(()=>document.querySelector('#role')?.value==='viewer');
  assert.equal(await page.getByRole('button',{name:'Private notes'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'New document'}).count(),0);
  await page.getByRole('button',{name:'Forget Drew'}).click();
  await page.getByRole('heading',{name:'Sign in',exact:true}).waitFor();
  assert.equal(await Session.countDocuments({account:'alder-multi',deviceHash:{$exists:true},revokedAt:null}),0);
  await context.close();
});
