import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const apiPort = Number(process.env.LAB_API_PORT || 4310);
const webPort = Number(process.env.LAB_WEB_PORT || 4311);
for (const port of [apiPort, webPort]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
}
export default defineConfig({
  plugins: [vue()],
  server: { port: webPort, strictPort: true, proxy: { '/api': `http://127.0.0.1:${apiPort}` } },
});
