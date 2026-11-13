import crypto from 'node:crypto';
import { Account, Challenge, Remembered, Session, Tenant } from './models.js';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const random = () => crypto.randomBytes(32).toString('base64url');
const origin = () => process.env.LAB_WEB_ORIGIN || `http://127.0.0.1:${process.env.LAB_WEB_PORT || 4311}`;
const cookieOptions = { httpOnly:true, sameSite:'strict', path:'/', secure:process.env.LAB_SECURE_COOKIES === 'true' };
export function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) { const i=part.indexOf('='); if (i>0) { try { result[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim()); } catch { /* invalid cookies are ignored */ } } }
  return result;
}
export function requireOrigin(req,res,next) {
  if (req.get('origin') !== origin()) return res.status(403).json({error:'Invalid origin'});
  next();
}
function setCredentials(res,token,csrf,device) {
  res.cookie('mal_session',token,cookieOptions);
  res.cookie('mal_csrf',csrf,{...cookieOptions,httpOnly:false});
  if(device) res.cookie('mal_device',device,{...cookieOptions,maxAge:30*24*60*60*1000});
}
function validContext(account,tenant,role) { return account?.active && tenant?.active && account.roles.includes(role); }
export function registerAuth(app, deliverChallenge) {
  app.post('/api/auth/challenge',requireOrigin,async(req,res,next)=>{try {
    const account = await Account.findById(typeof req.body?.account === 'string' ? req.body.account : '').lean();
    const tenant = account && await Tenant.findById(account.tenant).lean();
    if(account?.active && tenant?.active) {
      const existing = await Challenge.countDocuments({account:account._id,expiresAt:{$gt:new Date(Date.now()-4*60*1000)}});
      if(existing < 5) {
        const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
        await Challenge.create({account:account._id,codeHash:hash(code),expiresAt:new Date(Date.now()+5*60*1000)});
        await deliverChallenge({account:account._id,code});
      }
    }
    res.json({message:'If the account exists, a code was delivered to the local inbox.'});
  }catch(e){next(e);}});
  app.post('/api/auth/login',requireOrigin,async(req,res,next)=>{try {
    const {account:id,code,role}=req.body || {};
    if(typeof id!=='string' || typeof code!=='string' || !/^\d{6}$/.test(code)) return res.status(400).json({error:'Invalid sign-in'});
    const challenge = await Challenge.findOneAndUpdate({account:id,consumed:false,expiresAt:{$gt:new Date()},attempts:{$lt:5}},{$inc:{attempts:1}},{sort:{_id:-1},returnDocument:'after'});
    if(!challenge || challenge.codeHash!==hash(code)) return res.status(401).json({error:'Invalid sign-in'});
    const account=await Account.findById(id).lean(); const tenant=account && await Tenant.findById(account.tenant).lean();
    const selected = role || (account?.roles.length===1 ? account.roles[0] : null);
    if(!validContext(account,tenant,selected)) return res.status(401).json({error:'Invalid sign-in'});
    const consumed = await Challenge.updateOne({_id:challenge._id,consumed:false},{$set:{consumed:true}});
    if(!consumed.modifiedCount) return res.status(401).json({error:'Invalid sign-in'});
    const device = cookies(req).mal_device || random(); const token=random(); const csrf=random();
    await Session.create({_id:crypto.randomUUID(),account:id,role:selected,tokenHash:hash(token),csrfHash:hash(csrf),deviceHash:hash(device),expiresAt:new Date(Date.now()+8*60*60*1000)});
    await Remembered.updateOne({deviceHash:hash(device),account:id},{$setOnInsert:{deviceHash:hash(device),account:id}},{upsert:true});
    setCredentials(res,token,csrf,device); res.json({account:id,tenant:account.tenant,role:selected});
  }catch(e){next(e);}});
}
export function registerAccountRoutes(app) {
  app.get('/api/accounts',async(req,res,next)=>{try {
    const device=cookies(req).mal_device; if(!device || hash(device)!==req.context.session.deviceHash) return res.json({accounts:[]});
    const links=await Remembered.find({deviceHash:hash(device)}).lean();
    const accounts=[];
    for(const link of links) { const account=await Account.findById(link.account).lean(); const tenant=account && await Tenant.findById(account.tenant).lean(); if(!account?.active || !tenant?.active) continue;
      const live=await Session.exists({deviceHash:hash(device),account:account._id,revokedAt:null,expiresAt:{$gt:new Date()},role:{$in:account.roles}});
      accounts.push({id:account._id,name:account.name,tenant:tenant.name,needsReauth:!live}); }
    res.json({accounts});
  }catch(e){next(e);}});
  app.post('/api/accounts/:id/activate',async(req,res,next)=>{try {
    const device=cookies(req).mal_device; if(!device || hash(device)!==req.context.session.deviceHash) return res.status(401).json({error:'Device not authorized'});
    const dh=hash(device); const link=await Remembered.exists({deviceHash:dh,account:req.params.id});
    const account=link && await Account.findById(req.params.id).lean(); const tenant=account && await Tenant.findById(account.tenant).lean();
    if(!account?.active || !tenant?.active) return res.status(401).json({error:'Sign in required'});
    const target=await Session.findOne({deviceHash:dh,account:account._id,revokedAt:null,expiresAt:{$gt:new Date()},role:{$in:account.roles}}).sort({_id:-1}).lean();
    if(!target) return res.status(401).json({error:'Sign in required'});
    const token=random(), csrf=random();
    const updated=await Session.updateOne({_id:target._id,tokenHash:target.tokenHash,revokedAt:null,expiresAt:{$gt:new Date()}},{$set:{tokenHash:hash(token),csrfHash:hash(csrf)}});
    if(!updated.modifiedCount) return res.status(409).json({error:'Session changed; try again'});
    setCredentials(res,token,csrf); res.json({account:account._id,tenant:account.tenant,role:target.role});
  }catch(e){next(e);}});
  app.delete('/api/accounts/:id',async(req,res,next)=>{try {
    const device=cookies(req).mal_device; if(!device || hash(device)!==req.context.session.deviceHash) return res.status(401).json({error:'Device not authorized'});
    const deviceHash=hash(device);
    await Remembered.deleteOne({deviceHash,account:req.params.id});
    await Session.updateMany({deviceHash,account:req.params.id,revokedAt:null},{$set:{revokedAt:new Date()}});
    if(req.params.id===req.context.account._id) {res.clearCookie('mal_session',cookieOptions);res.clearCookie('mal_csrf',{...cookieOptions,httpOnly:false});}
    res.status(204).end();
  }catch(e){next(e);}});
  app.post('/api/session/role',async(req,res,next)=>{try {
    const role=req.body?.role; if(!req.context.account.roles.includes(role)) return res.status(403).json({error:'Role not assigned'});
    await Session.updateOne({_id:req.context.session._id},{$set:{role}}); res.json({account:req.context.account._id,tenant:req.context.tenant._id,role});
  }catch(e){next(e);}});
}
export { hash };
