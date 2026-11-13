import { resolve } from 'node:path';
import { prepare } from './task.js';
const args=process.argv.slice(2), flag=args.indexOf('--task'), task=flag>=0?args[flag+1]:'cookie-migration';
const destination=args.find((arg,index)=>!arg.startsWith('--') && (flag<0 || index!==flag+1));
if(!destination || !task){console.error('Usage: npm run task:prepare -- /path/to/new-directory [--task ID]');process.exit(2);}
try { await prepare(resolve(destination),task); console.log(`Task workspace created at ${resolve(destination)}`); }
catch(error){ console.error(error.message); process.exitCode=1; }
