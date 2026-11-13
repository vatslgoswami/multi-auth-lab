import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connect, disconnect, databaseUri } from '../src/db.js';
import { resetFixtures } from '../src/fixtures.js';
import { Session } from '../src/models.js';
import { createApp } from '../src/app.js';
const inbox=new Map(), app=createApp({deliverChallenge:async({account,code})=>inbox.set(account,code)}), origin='http://127.0.0.1:4311';
before(async()=>{if(!new URL(databaseUri()).pathname.startsWith('/multiauthlab_test_'))throw new Error('Tests require a dedicated test database');await connect();});
beforeEach(async()=>resetFixtures());after(async()=>disconnect());
async function login(agent,account){await agent.post('/api/auth/challenge').set('Origin',origin).send({account});return agent.post('/api/auth/login').set('Origin',origin).send({account,code:inbox.get(account)});}
const csrf=response=>decodeURIComponent(response.headers['set-cookie'].find(c=>c.startsWith('mal_csrf=')).split(';')[0].slice('mal_csrf='.length));
const activate=(agent,id,token,account)=>agent.post(`/api/accounts/${id}/activate`).set('Origin',origin).set('X-CSRF-Token',token).set('X-Expected-Account',account).set('X-Expected-Role','owner');
test('saved accounts require a live session on the same browser',async()=>{
  const agent=request.agent(app);assert.equal((await login(agent,'alder-owner')).status,200);const birch=await login(agent,'birch-owner');assert.equal(birch.status,200);
  let response=await agent.get('/api/accounts');assert.equal(response.status,200);assert.equal(response.body.accounts.length,2);
  response=await activate(agent,'alder-owner',csrf(birch),'birch-owner');assert.equal(response.status,200);assert.equal(response.body.account,'alder-owner');
  const other=request.agent(app), otherLogin=await login(other,'alder-owner');
  assert.equal((await activate(other,'birch-owner',csrf(otherLogin),'alder-owner')).status,401);
  await Session.updateMany({account:'birch-owner'},{$set:{revokedAt:new Date()}});
  assert.equal((await activate(agent,'birch-owner',csrf(response),'alder-owner')).status,401);
});
