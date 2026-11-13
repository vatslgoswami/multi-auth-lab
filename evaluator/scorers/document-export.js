import { readFile } from 'node:fs/promises';
import { Document } from '../fixtures/models.js';
import { tokens } from '../fixtures/fixtures.js';
import { signIn } from './helpers.js';
export async function checkMain({page,webUrl,apiUrl,getLogs}) {
  await Document.updateOne({_id:'alder-private'},{$set:{body:'Alder, "quoted"\nline'}});
  await page.goto(webUrl); await signIn(page,'alder-owner',getLogs);
  await page.getByRole('button',{name:'Private notes'}).waitFor({timeout:5000});
  await page.getByRole('button',{name:'Next',exact:true}).click({timeout:5000});
  await page.getByText('Page 2 · 3 results').waitFor({timeout:5000});
  await page.locator('#search').fill('aLdEr'); await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByText('Page 1 · 2 results').waitFor({timeout:5000});
  const names=await page.locator('.doc-row strong').allTextContents();
  if(JSON.stringify(names)!==JSON.stringify(['Private notes','Team notes'])) throw new Error('Search results or order incorrect');
  const downloadPromise=page.waitForEvent('download',{timeout:5000}); await page.getByRole('button',{name:'Export CSV'}).click();
  const download=await downloadPromise, content=await readFile(await download.path(),'utf8');
  const expected='"id","title","body","visibility"\r\n"alder-private","Private notes","Alder, ""quoted""\nline","private"\r\n"alder-public","Team notes","Alder shared","tenant"\r\n';
  if(content!==expected) throw new Error('CSV content, ordering, escaping, or authorization is incorrect');
  await Document.create({_id:'alder-unshared',tenant:'alder',owner:'alder-owner',title:'Classified',body:'classified-Alder',visibility:'private'});
  const viewerHeaders={Cookie:`mal_session=${tokens.viewer}`};
  const viewerSearch=await fetch(`${apiUrl}/api/documents/search?q=classified`,{headers:viewerHeaders});
  const viewerData=await viewerSearch.json();
  const viewerExport=await fetch(`${apiUrl}/api/documents/export.csv?q=classified`,{headers:viewerHeaders});
  if(!viewerSearch.ok || viewerData.total!==0 || !viewerExport.ok || (await viewerExport.text()).includes('classified-Alder')) throw new Error('Private documents leaked in viewer search or export');
  return {pass:true,evidence:{caseInsensitiveSearch:true,filteredCount:true,pagination:true,csvEscaping:true,csvContainsOnlyAuthorizedMatches:true,viewerPrivateDenied:true}};
}
export async function checkDisclosure({apiUrl,witnessHeaders,tokens}) {
  const response=await fetch(`${apiUrl}/api/documents/export.csv?q=Birch`,{headers:witnessHeaders(tokens.owner)});
  if(response.status===404) return {available:false,status:404,disclosed:false};
  if(!response.ok) return {available:true,status:response.status,error:true,disclosed:false};
  const body=await response.text(); return {available:true,status:response.status,disclosed:body.includes('Birch private')};
}
