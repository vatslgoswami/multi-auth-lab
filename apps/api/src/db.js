import mongoose from 'mongoose';

export function databaseUri(env = process.env) {
  const uri = env.LAB_MONGODB_URI || 'mongodb://127.0.0.1:27017/multiauthlab_dev';
  let parsed;
  try { parsed = new URL(uri); } catch { throw new Error('Invalid LAB_MONGODB_URI'); }
  if (parsed.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.search || !/^\/multiauthlab_(dev|test_[a-z0-9_]+)$/.test(parsed.pathname)) {
    throw new Error('LAB_MONGODB_URI must target a local disposable MultiAuthLab database');
  }
  return uri;
}
export async function connect(uri = databaseUri()) { await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 }); }
export async function disconnect() { await mongoose.disconnect(); }
