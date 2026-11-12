import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connect, disconnect, databaseUri } from '../src/db.js';
import { resetFixtures, tokens } from '../src/fixtures.js';
import { Account, Session, Tenant, Document, Grant } from '../src/models.js';
import { createApp } from '../src/app.js';
const inbox = new Map();
const app=createApp({deliverChallenge:async ({account,code})=>inbox.set(account,code)});
const contexts = { [tokens.owner]:['alder-owner','owner'], [tokens.editor]:['alder-editor','editor'], [tokens.viewer]:['alder-viewer','viewer'], [tokens.birch]:['birch-owner','owner'], [tokens.revoked]:['alder-editor','editor'], [tokens.expired]:['alder-editor','editor'], [tokens.multi]:['alder-multi','viewer'] };
const auth = (method,path,token) => request(app)[method](path).set('Cookie', [`mal_session=${token}`, 'mal_csrf=dev-csrf']).set('Origin','http://127.0.0.1:4311').set('X-CSRF-Token','dev-csrf').set('X-Expected-Account',contexts[token]?.[0] || 'unknown').set('X-Expected-Role',contexts[token]?.[1] || 'viewer');
before(async()=>{ if (!new URL(databaseUri()).pathname.startsWith('/multiauthlab_test_')) throw new Error('Tests require a dedicated multiauthlab_test_* database'); await connect(); });
beforeEach(async()=>{ await resetFixtures(); });
after(async()=>{ await disconnect(); });

test('reset is repeatable and session credentials are hashed',async()=>{
  await resetFixtures();
  assert.equal(await Document.countDocuments(),4);
  assert.equal(await Session.countDocuments(),7);
  assert.equal(await Session.countDocuments({tokenHash:tokens.owner}),0);
  const indexes=await Grant.collection.indexes(); assert.ok(indexes.some(i=>i.unique && i.key.document===1 && i.key.account===1));
});
test('tenant and private document permissions match active role',async()=>{
  let r=await auth('get','/api/documents',tokens.editor); assert.equal(r.status,200); assert.deepEqual(r.body.documents.map(d=>d._id),['alder-editor-doc','alder-private','alder-public']);
  assert.equal((await auth('get','/api/documents/birch-private',tokens.owner)).status,404);
  assert.equal((await auth('get','/api/documents/alder-private',tokens.multi)).status,404);
  assert.equal((await auth('get','/api/documents/alder-private',tokens.birch)).status,404);
  assert.equal((await auth('get','/api/documents/birch-private',tokens.birch)).status,200);
});
test('role ceiling, ownership and grants govern writes',async()=>{
  assert.equal((await auth('patch','/api/documents/alder-private',tokens.editor).send({body:'changed'})).status,200);
  assert.equal((await auth('patch','/api/documents/alder-private',tokens.viewer).send({body:'forbidden'})).status,404);
  assert.equal((await auth('patch','/api/documents/alder-public',tokens.editor).send({body:'forbidden'})).status,404);
  assert.equal((await auth('patch','/api/documents/alder-public',tokens.multi).send({body:'forbidden'})).status,404);
  assert.equal((await Document.findById('alder-public')).body,'Alder shared');
  assert.equal((await auth('delete','/api/documents/alder-private',tokens.viewer)).status,404);
  assert.ok(await Document.findById('alder-private'));
  assert.equal((await auth('delete','/api/documents/alder-editor-doc',tokens.editor)).status,204);
  assert.equal(await Document.findById('alder-editor-doc'),null);
  assert.equal((await auth('post','/api/documents',tokens.viewer).send({id:'x',title:'X',body:'',visibility:'private'})).status,403);
  assert.equal((await auth('post','/api/documents',tokens.editor).send({id:'new',title:'New',body:'Text',visibility:'private',tenant:'birch'})).body.tenant,'alder');
});
test('grants cannot cross tenants or escape acting role',async()=>{
  assert.equal((await auth('put','/api/documents/alder-private/grants/birch-owner',tokens.owner).send({permission:'read'})).status,404);
  assert.equal((await auth('put','/api/documents/alder-private/grants/alder-multi',tokens.editor).send({permission:'read'})).status,403);
  assert.equal((await auth('put','/api/documents/alder-private/grants/alder-multi',tokens.owner).send({permission:'read'})).status,200);
  assert.equal((await auth('get','/api/documents/alder-private',tokens.multi)).status,200);
  assert.equal((await auth('patch','/api/documents/alder-private',tokens.multi).send({body:'no'})).status,404);
});
test('expired, revoked, logged out, disabled and removed-role sessions fail',async()=>{
  for(const token of [tokens.revoked,tokens.expired,'unknown']) assert.equal((await auth('get','/api/session',token)).status,401);
  assert.equal((await auth('post','/api/session/logout',tokens.editor)).status,204);
  assert.equal((await auth('patch','/api/documents/alder-editor-doc',tokens.editor).send({body:'no'})).status,401);
  assert.equal((await Document.findById('alder-editor-doc')).body,'Editor draft');
  await Account.updateOne({_id:'alder-owner'},{$set:{active:false}}); assert.equal((await auth('get','/api/session',tokens.owner)).status,401);
  await Account.updateOne({_id:'alder-multi'},{$set:{roles:['owner']}}); assert.equal((await auth('get','/api/session',tokens.multi)).status,401);
  await Tenant.updateOne({_id:'birch'},{$set:{active:false}}); assert.equal((await auth('get','/api/session',tokens.birch)).status,401);
});
test('reset URI must explicitly target disposable local databases',()=>{
  for (const uri of ['mongodb://example.com/multiauthlab_dev','mongodb://127.0.0.1/production','mongodb://127.0.0.1/multiauthlab_dev?x=1','mongodb://user:pass@localhost/multiauthlab_dev']) assert.throws(()=>databaseUri({LAB_MONGODB_URI:uri}));
});


test('one-time sign-in enforces origin, CSRF, context and one-use codes', async()=>{
  const agent=request.agent(app), origin='http://127.0.0.1:4311';
  assert.equal((await agent.post('/api/auth/challenge').send({account:'alder-owner'})).status,403);
  assert.equal((await agent.post('/api/auth/challenge').set('Origin',origin).send({account:'alder-owner'})).status,200);
  const code=inbox.get('alder-owner');
  const login=await agent.post('/api/auth/login').set('Origin',origin).send({account:'alder-owner',code});
  assert.equal(login.status,200);
  assert.ok(login.headers['set-cookie'].some(c=>c.startsWith('mal_session=') && c.includes('HttpOnly')));
  assert.equal((await agent.post('/api/auth/login').set('Origin',origin).send({account:'alder-owner',code})).status,401);
  const csrf=decodeURIComponent(login.headers['set-cookie'].find(c=>c.startsWith('mal_csrf=')).split(';')[0].slice('mal_csrf='.length));
  const body={body:'must not change'};
  assert.equal((await agent.patch('/api/documents/alder-private').set('Origin',origin).set('X-Expected-Account','alder-owner').set('X-Expected-Role','owner').send(body)).status,403);
  assert.equal((await agent.patch('/api/documents/alder-private').set('Origin','http://evil.example').set('X-CSRF-Token',csrf).set('X-Expected-Account','alder-owner').set('X-Expected-Role','owner').send(body)).status,403);
  assert.equal((await agent.patch('/api/documents/alder-private').set('Origin',origin).set('X-CSRF-Token',csrf).set('X-Expected-Account','birch-owner').set('X-Expected-Role','owner').send(body)).status,409);
  assert.equal((await Document.findById('alder-private')).body,'Alder private');
  assert.equal((await agent.get('/api/session').set('Authorization',`Bearer ${tokens.owner}`)).status,401);
});


test('another browser cannot activate an account without a remembered link', async()=>{
  const agent=request.agent(app), origin='http://127.0.0.1:4311';
  await agent.post('/api/auth/challenge').set('Origin',origin).send({account:'alder-owner'});
  const login=await agent.post('/api/auth/login').set('Origin',origin).send({account:'alder-owner',code:inbox.get('alder-owner')});
  const csrf=decodeURIComponent(login.headers['set-cookie'].find(c=>c.startsWith('mal_csrf=')).split(';')[0].slice('mal_csrf='.length));
  const result=await agent.post('/api/accounts/birch-owner/activate').set('Origin',origin).set('X-CSRF-Token',csrf).set('X-Expected-Account','alder-owner').set('X-Expected-Role','owner');
  assert.equal(result.status,401);
  assert.equal((await agent.get('/api/session')).body.account,'alder-owner');
});
