import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connect, disconnect, databaseUri } from '../src/db.js';
import { resetFixtures, tokens } from '../src/fixtures.js';
import { Account, Session, Tenant, Document, Grant } from '../src/models.js';
import { createApp } from '../src/app.js';
const app=createApp();
const auth = (method,path,token) => request(app)[method](path).set('Authorization',`Bearer ${token}`);
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
