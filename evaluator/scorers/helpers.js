export async function signIn(page,account,getLogs,role) {
  await page.locator('#account').selectOption(account);
  if(role) await page.locator('#login-role').selectOption(role);
  await page.getByRole('button',{name:'Send sign-in code'}).click();
  await page.locator('#code').waitFor({timeout:5000});
  const escaped=account.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const matches=[...getLogs().matchAll(new RegExp(`\\[local inbox\\] ${escaped}: (\\d{6})`,'g'))];
  if(!matches.length) throw new Error('Local sign-in code unavailable');
  await page.locator('#code').fill(matches.at(-1)[1]);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Documents'}).waitFor({timeout:5000});
}
