import express from 'express';
import { cookies, hash, registerAuth, registerAccountRoutes, requireOrigin } from './browser-auth.js';
import { Account, Document, Grant, Session, Tenant } from './models.js';
const validId = value => typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value);
const fail = (res,status,message) => res.status(status).json({error:message});

export function createApp({ deliverChallenge = async ({account,code}) => console.log(`[local inbox] ${account}: ${code}`) } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({limit:'32kb'}));
  app.get('/api/health', (_req,res) => res.json({status:'ok',stage:'protected-api'}));
  registerAuth(app, deliverChallenge);
  app.use('/api', async (req,res,next) => {
    try {
      const authorization = req.get('authorization') || '';
      if (!authorization.startsWith('Bearer ') || !authorization.slice(7)) return fail(res,401,'Authentication required');
      const token = authorization.slice(7);
      const session = await Session.findOne({tokenHash:hash(token),revokedAt:null,expiresAt:{$gt:new Date()}}).lean();
      if (!session) return fail(res,401,'Invalid session');
      const account = await Account.findById(session.account).lean();
      if (!account?.active || !account.tenant || !account.roles.includes(session.role)) return fail(res,401,'Invalid session');
      const tenant = await Tenant.findById(account.tenant).lean();
      if (!tenant?.active) return fail(res,401,'Invalid session');
      req.context = {session,account,tenant,role:session.role};
      if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
        if (req.get('origin') !== (process.env.LAB_WEB_ORIGIN || `http://127.0.0.1:${process.env.LAB_WEB_PORT || 4311}`)) return fail(res,403,'Invalid origin');
        if (req.get('x-expected-account')!==account._id || req.get('x-expected-role')!==session.role) return fail(res,409,'Account context changed');
      }
      next();
    } catch (error) { next(error); }
  });
  registerAccountRoutes(app);
  app.get('/api/session', (req,res) => res.json({account:req.context.account._id,name:req.context.account.name,tenant:req.context.tenant._id,tenantName:req.context.tenant.name,role:req.context.role,roles:req.context.account.roles}));
  app.post('/api/session/logout', async (req,res,next) => { try { await Session.updateOne({_id:req.context.session._id},{$set:{revokedAt:new Date()}}); res.clearCookie('mal_session',{httpOnly:true,sameSite:'strict',path:'/',secure:process.env.LAB_SECURE_COOKIES === 'true'}); res.clearCookie('mal_csrf',{sameSite:'strict',path:'/',secure:process.env.LAB_SECURE_COOKIES === 'true'}); res.status(204).end(); } catch(e) {next(e);} });
  async function access(req,id,write=false) {
    if (!validId(id)) return null;
    const doc = await Document.findOne({_id:id,tenant:req.context.tenant._id}).lean();
    if (!doc) return null;
    const {account,role} = req.context;
    if (role === 'owner') return doc;
    const grant = await Grant.findOne({document:doc._id,account:account._id}).lean();
    if (write) return role === 'editor' && (doc.owner === account._id || grant?.permission === 'write') ? doc : null;
    return doc.visibility === 'tenant' || doc.owner === account._id || grant ? doc : null;
  }
  app.get('/api/documents', async (req,res,next) => { try {
    const docs = await Document.find({tenant:req.context.tenant._id}).sort({_id:1}).lean();
    const allowed = await Promise.all(docs.map(d => access(req,d._id)));
    res.json({documents:allowed.filter(Boolean)});
  } catch(e) {next(e);} });
  app.get('/api/documents/:id', async (req,res,next) => { try { const doc=await access(req,req.params.id); if(!doc) return fail(res,404,'Document not found'); res.json(doc); } catch(e){next(e);} });
  app.post('/api/documents', async (req,res,next) => { try {
    if (!['owner','editor'].includes(req.context.role)) return fail(res,403,'Forbidden');
    const {id,title,body,visibility} = req.body || {};
    if (!validId(id) || typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !['private','tenant'].includes(visibility)) return fail(res,400,'Invalid document');
    const doc = await Document.create({_id:id,tenant:req.context.tenant._id,owner:req.context.account._id,title,body,visibility});
    res.status(201).json(doc);
  } catch(e) { if(e.code===11000) return fail(res,409,'Document already exists'); next(e); } });
  app.patch('/api/documents/:id', async (req,res,next) => { try {
    const doc=await access(req,req.params.id,true); if(!doc) return fail(res,404,'Document not found');
    const {title,body,visibility}=req.body || {};
    if ((title !== undefined && (typeof title !== 'string' || !title.trim())) || (body !== undefined && typeof body !== 'string') || (visibility !== undefined && !['private','tenant'].includes(visibility)) || Object.keys(req.body || {}).some(k=>!['title','body','visibility'].includes(k))) return fail(res,400,'Invalid document');
    const update = Object.fromEntries(Object.entries({title,body,visibility}).filter(([,v])=>v!==undefined));
    res.json(await Document.findOneAndUpdate({_id:doc._id,tenant:req.context.tenant._id},{$set:update},{returnDocument:'after',runValidators:true}).lean());
  } catch(e){next(e);} });
  app.delete('/api/documents/:id', async (req,res,next) => { try {
    const doc=await access(req,req.params.id,true); if(!doc) return fail(res,404,'Document not found');
    await Document.deleteOne({_id:doc._id,tenant:req.context.tenant._id});
    await Grant.deleteMany({document:doc._id});
    res.status(204).end();
  } catch(e){next(e);} });
  app.put('/api/documents/:id/grants/:account', async (req,res,next) => { try {
    if(req.context.role!=='owner') return fail(res,403,'Forbidden');
    const doc=await access(req,req.params.id,true); const target=validId(req.params.account) ? await Account.findOne({_id:req.params.account,tenant:req.context.tenant._id,active:true}).lean() : null;
    if(!doc || !target) return fail(res,404,'Document or account not found');
    if(!['read','write'].includes(req.body?.permission)) return fail(res,400,'Invalid permission');
    const grant=await Grant.findOneAndUpdate({document:doc._id,account:target._id},{$set:{permission:req.body.permission}},{upsert:true,returnDocument:'after',runValidators:true}).lean(); res.json(grant);
  } catch(e){next(e);} });
  app.use('/api', (_req,res)=>fail(res,404,'Not found'));
  app.use((err,_req,res,_next)=>{ if(err.type==='entity.parse.failed') return fail(res,400,'Invalid JSON'); console.error(err); fail(res,500,'Internal error'); });
  return app;
}
