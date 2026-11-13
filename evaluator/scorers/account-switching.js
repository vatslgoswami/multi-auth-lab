import { Session } from '../fixtures/models.js';
import { signIn } from './helpers.js';
export async function checkMain({page,context,webUrl,apiUrl,getLogs}) {
  await page.goto(webUrl); await signIn(page,'alder-owner',getLogs);
  const oldToken=(await context.cookies()).find(cookie=>cookie.name==='mal_session')?.value;
  await page.getByRole('button',{name:'Private notes'}).click();
  await page.locator('#body').fill('Alder unsaved draft');
  const tab=await context.newPage();
  let release, captured, completed;
  const gate=new Promise(resolve=>{release=resolve;}), held=new Promise(resolve=>{captured=resolve;}), fulfilled=new Promise(resolve=>{completed=resolve;});
  await tab.route('**/api/documents',async route=>{ try { const response=await route.fetch(); captured(); await gate; await route.fulfill({response}); } finally { completed(); } },{times:1});
  try {
    await tab.goto(webUrl); await tab.getByRole('heading',{name:'Documents'}).waitFor({timeout:5000});
    await Promise.race([held,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Old response was not captured')),5000))]);
    await page.getByRole('button',{name:'Add',exact:true}).click({timeout:5000}); await signIn(page,'birch-owner',getLogs);
    await tab.getByRole('heading',{name:'Birch',exact:true}).waitFor({timeout:5000});
    await tab.getByRole('button',{name:'Birch notes'}).waitFor({timeout:5000});
  } finally { release(); }
  await fulfilled; await tab.waitForTimeout(100);
  if(await tab.getByRole('button',{name:'Private notes'}).count()) throw new Error('A stale response exposed the previous account');
  await page.getByRole('button',{name:/Alex.*Alder/}).click();
  await page.getByRole('button',{name:'Private notes'}).click();
  const newToken=(await context.cookies()).find(cookie=>cookie.name==='mal_session')?.value;
  if(!oldToken || !newToken || oldToken===newToken || (await fetch(`${apiUrl}/api/session`,{headers:{Cookie:`mal_session=${oldToken}`}})).status!==401) throw new Error('Account activation did not rotate its credential');
  if(await page.locator('#body').inputValue()!=='Alder unsaved draft') throw new Error('Draft was not restored');
  const stale=await page.evaluate(async()=>{const csrf=decodeURIComponent(document.cookie.split('; ').find(c=>c.startsWith('mal_csrf='))?.slice(9)||''); return (await fetch('/api/documents/alder-private',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-Expected-Account':'birch-owner','X-Expected-Role':'owner'},body:JSON.stringify({body:'wrong account'})})).status;});
  if(stale!==409) throw new Error('A stale account context was not rejected');
  await Session.updateMany({account:'birch-owner'},{$set:{revokedAt:new Date()}});
  await page.reload(); await page.getByText('Birch · Sign in again').waitFor({timeout:5000});
  await page.getByRole('button',{name:'Forget Ellis'}).click();
  await page.getByText('Birch · Sign in again').waitFor({state:'hidden',timeout:5000});
  await tab.close();
  return {pass:true,evidence:{switching:true,credentialRotated:true,otherTabUpdated:true,staleResponseRejected:true,draftRestored:true,staleWriteStatus:stale,revokedRequiresSignIn:true,forget:true}};
}
