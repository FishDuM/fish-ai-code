import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const backendTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8911';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          // 关键：SSE 流式响应不能被代理缓冲，否则前端一次性收到全部内容、失去流式效果
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['X-Accel-Buffering'] = 'no';
              proxyRes.headers['Cache-Control'] = 'no-cache';
            });
          },
        },
        // Static resources are served via /api/static/{deployKey}/
        // (handled by the /api proxy rule above since backend has context-path: /api)
      },
    },
  };
})
