import { connect } from './src/db.js';
import { createApp } from './src/app.js';
const port = Number(process.env.LAB_API_PORT || 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('LAB_API_PORT must be a valid port number');
await connect();
createApp().listen(port, '127.0.0.1', () => console.log(`API listening at http://127.0.0.1:${port}`));
