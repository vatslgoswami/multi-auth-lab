import { resolve } from 'node:path';
import { prepare } from './task.js';
const destination=process.argv[2];
if(!destination){console.error('Usage: npm run task:prepare -- /path/to/new-directory');process.exit(2);}
try { await prepare(resolve(destination)); console.log(`Task workspace created at ${resolve(destination)}`); }
catch(error){ console.error(error.message); process.exitCode=1; }
