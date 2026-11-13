import { spawnSync } from 'node:child_process';
const required = 'v24.22.3';
console.log(`Node: ${process.version}${process.version === required ? ' (pinned version)' : ` (pinned: ${required})`}`);
const mongo = spawnSync('mongod', ['--version'], { encoding: 'utf8', timeout: 3000 });
console.log(`MongoDB: ${mongo.status === 0 ? mongo.stdout.split('\n')[0] : 'not found; needed for the next checkpoint'}`);
console.log('Isolated evaluation: remote Linux host and Docker access must be verified before checkpoint 4.');
if (process.version !== required) process.exitCode = 1;
