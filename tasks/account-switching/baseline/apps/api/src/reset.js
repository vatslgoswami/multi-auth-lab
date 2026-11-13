import { connect, disconnect } from './db.js';
import { resetFixtures } from './fixtures.js';
await connect();
try { await resetFixtures(); console.log('Synthetic fixtures reset.'); } finally { await disconnect(); }
