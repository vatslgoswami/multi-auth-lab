import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { connect, disconnect, databaseUri } from '../src/db.js';
import { resetFixtures, tokens } from '../src/fixtures.js';
import { createApp } from '../src/app.js';
import { Document } from '../src/models.js';
const app=createApp();
const auth=path=>request(app).get(path).set('Cookie',[`mal_session=${tokens.owner}`,'mal_csrf=dev-csrf']);
before(async()=>{if(!new URL(databaseUri()).pathname.startsWith('/multiauthlab_test_'))throw new Error('Tests require a dedicated test database');await connect();});
beforeEach(async()=>resetFixtures());after(async()=>disconnect());
test('search paginates permitted matches and export keeps tenant boundaries',async()=>{
  let response=await auth('/api/documents/search?q=alder&page=1');
  assert.equal(response.status,200);assert.equal(response.body.total,2);assert.deepEqual(response.body.documents.map(d=>d._id),['alder-private','alder-public']);
  response=await auth('/api/documents/search?page=2');assert.deepEqual(response.body.documents.map(d=>d._id),['alder-public']);assert.equal(response.body.total,3);
  assert.equal((await auth('/api/documents/search?page=0')).status,400);
  assert.equal((await auth(`/api/documents/search?q=${'x'.repeat(101)}`)).status,400);
  response=await auth('/api/documents/export.csv?q=Birch');assert.equal(response.status,200);assert.doesNotMatch(response.text,/Birch private/);
});

test('viewer search and export exclude unshared private documents',async()=>{
  await Document.create({_id:'unshared',tenant:'alder',owner:'alder-owner',title:'Classified',body:'secret-marker',visibility:'private'});
  const viewer=path=>request(app).get(path).set('Cookie',[`mal_session=${tokens.viewer}`,'mal_csrf=dev-csrf']);
  let response=await viewer('/api/documents/search?q=classified');assert.equal(response.status,200);assert.equal(response.body.total,0);
  response=await viewer('/api/documents/export.csv?q=classified');assert.equal(response.status,200);assert.doesNotMatch(response.text,/secret-marker/);
});
