import express from 'express';

const app = express();
const port = Number(process.env.LAB_API_PORT || 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('LAB_API_PORT must be a valid port number');
}
app.disable('x-powered-by');
app.get('/api/health', (_req, res) => res.json({ status: 'ok', stage: 'scaffold' }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(port, '127.0.0.1', () => console.log(`API listening at http://127.0.0.1:${port}`));
