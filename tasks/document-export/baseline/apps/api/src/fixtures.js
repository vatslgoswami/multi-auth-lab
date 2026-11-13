import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Tenant, Account, Session, Document, Grant, Remembered, Challenge } from './models.js';
export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
// Public synthetic credentials are only for the disposable development database.
export const tokens = Object.freeze({ owner:'dev-alder-owner', editor:'dev-alder-editor', viewer:'dev-alder-viewer', birch:'dev-birch-owner', revoked:'dev-revoked', expired:'dev-expired', multi:'dev-multi-viewer' });
export async function resetFixtures() {
  const name = mongoose.connection.name;
  if (!/^multiauthlab_(dev|test_[a-z0-9_]+)$/.test(name || '')) throw new Error('Refusing to reset a non-disposable database');
  for (const model of [Challenge,Remembered,Grant,Document,Session,Account,Tenant]) await model.deleteMany({});
  await Tenant.insertMany([{_id:'alder',name:'Alder'},{_id:'birch',name:'Birch'},{_id:'cedar',name:'Cedar',active:false}]);
  await Account.insertMany([
    {_id:'alder-owner',tenant:'alder',name:'Alex',roles:['owner']},
    {_id:'alder-editor',tenant:'alder',name:'Blair',roles:['editor']},
    {_id:'alder-viewer',tenant:'alder',name:'Casey',roles:['viewer']},
    {_id:'alder-multi',tenant:'alder',name:'Drew',roles:['owner','viewer']},
    {_id:'birch-owner',tenant:'birch',name:'Ellis',roles:['owner']},
    {_id:'disabled',tenant:'alder',name:'Finley',roles:['editor'],active:false}
  ]);
  const future = new Date('2100-01-01T00:00:00Z');
  await Session.insertMany([
    ['owner','alder-owner','owner',future,null],['editor','alder-editor','editor',future,null],
    ['viewer','alder-viewer','viewer',future,null],['birch','birch-owner','owner',future,null],
    ['revoked','alder-editor','editor',future,new Date('2020-01-01T00:00:00Z')],
    ['expired','alder-editor','editor',new Date('2020-01-01T00:00:00Z'),null],
    ['multi','alder-multi','viewer',future,null]
  ].map(([id,account,role,expiresAt,revokedAt]) => ({_id:id,account,role,expiresAt,revokedAt,tokenHash:hashToken(tokens[id]),csrfHash:hashToken('dev-csrf')})));
  await Document.insertMany([
    {_id:'alder-public',tenant:'alder',owner:'alder-owner',title:'Team notes',body:'Alder shared',visibility:'tenant'},
    {_id:'alder-private',tenant:'alder',owner:'alder-owner',title:'Private notes',body:'Alder private',visibility:'private'},
    {_id:'alder-editor-doc',tenant:'alder',owner:'alder-editor',title:'Draft',body:'Editor draft',visibility:'private'},
    {_id:'birch-private',tenant:'birch',owner:'birch-owner',title:'Birch notes',body:'Birch private',visibility:'private'}
  ]);
  await Grant.insertMany([{document:'alder-private',account:'alder-editor',permission:'write'}, {document:'alder-private',account:'alder-viewer',permission:'write'}]);
  await Promise.all([Tenant,Account,Session,Document,Grant,Remembered,Challenge].map(model => model.createIndexes()));
}
