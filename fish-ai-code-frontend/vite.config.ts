import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { buildEditModeScript, wrapEditModeScript } from './src/utils/editModeInjector'

/**
 * Vite plugin: serve built Vue project dist files directly from the code_output directory.
 * 
 * The backend auto-builds Vue projects after SSE streaming completes (via
 * JsonMessageStreamHandler → VueProjectBuilder.buildProjectAsync). The dist files
 * end up at:
 *   {project_root}/tmp/code_output/vue_project_{appId}/dist/
 * 
 * This plugin serves those files at:
 *   /vue-preview/{appId}/{path}
 * 
 * No backend change needed — the files are served directly by the Vite dev server.
 */
function vuePreviewPlugin(): Plugin {
  const CODE_OUTPUT_DIR = path.resolve(__dirname, '../tmp/code_output');

  function injectEditModeScript(html: string): string {
    const wrapper = wrapEditModeScript(buildEditModeScript());
    const closeHead = /<\/head\s*>/i;
    if (closeHead.test(html)) {
      return html.replace(closeHead, `${wrapper}</head>`);
    }
    const closeBody = /<\/body\s*>/i;
    if (closeBody.test(html)) {
      return html.replace(closeBody, `${wrapper}</body>`);
    }
    const closeHtml = /<\/html\s*>/i;
    if (closeHtml.test(html)) {
      return html.replace(closeHtml, `${wrapper}</html>`);
    }
    return html + wrapper;
  }

  // True iff `resolvedPath` is `distDir` itself or sits strictly inside it
  // (no traversal, no sibling with a shared prefix like `/dist_evil`).
  function isInsideDir(distDir: string, resolvedPath: string): boolean {
    const rel = path.relative(distDir, resolvedPath);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  return {
    name: 'vue-preview',
    configureServer(server) {
      // Match /vue-preview/{appId}/... paths
      // Note: Connect/Vite strips the mount prefix ('/vue-preview/') from req.url,
      // so for a request to /vue-preview/123/ → req.url becomes /123/
      server.middlewares.use('/vue-preview/', (req, res, next) => {
        const url = req.url || '';

        // Strip the query string before matching — the frontend uses
        // cache-busting query params like `?poll=${Date.now()}` to avoid
        // serving stale "Building..." responses. If we don't strip these,
        // the regex below treats `?poll=xxx` as the file path and the
        // existence check on the dist dir always fails.
        const pathname = url.split('?')[0];
        const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
        const searchParams = new URLSearchParams(query);
        const requestedSince = Number(searchParams.get('since') || 0);
        const shouldInjectEditMode = searchParams.get('fish_edit_mode') === '1';

        // Extract appId and file path from URL.
        // /vue-preview/{appId}/some/path.js  →  appId, some/path.js
        // /vue-preview/{appId}/              →  appId, index.html
        // appId may be any non-empty, non-slash, non-dot segment; we don't
        // assume it's numeric (backends may switch to UUIDs etc.).
        const match = pathname.match(/^\/([^/]+)\/(.*)$/);
        if (!match) return next();

        const appId = match[1];
        // Reject path components that contain traversal markers up-front.
        if (appId.includes('..') || appId === '.' || appId === '') return next();
        const filePath = match[2] || 'index.html';
        const distDir = path.resolve(CODE_OUTPUT_DIR, `vue_project_${appId}`, 'dist');
        const resolvedPath = path.resolve(distDir, filePath);

        // Security: ensure the resolved path stays within the dist directory.
        // Using path.relative avoids the `/foo/dist` vs `/foo/dist_evil`
        // prefix-collision bug of a raw `startsWith`.
        if (!isInsideDir(distDir, resolvedPath)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        if (!fs.existsSync(resolvedPath)) {
          // File not ready yet (build still in progress)
          res.statusCode = 404;
          res.end('Building...');
          return;
        }

        if (filePath === 'index.html' && Number.isFinite(requestedSince) && requestedSince > 0) {
          const indexMtime = fs.statSync(resolvedPath).mtimeMs;
          if (indexMtime < requestedSince) {
            // A previous build's dist/index.html still exists. Treat it as
            // not ready so the chat UI waits for the async backend rebuild
            // that was triggered by the current SSE completion.
            res.statusCode = 404;
            res.end('Building...');
            return;
          }
          res.setHeader('X-Fish-Build-Mtime', String(Math.floor(indexMtime)));
        }

        const ext = path.extname(filePath).toLowerCase();
        const mime: Record<string, string> = {
          '.html': 'text/html; charset=UTF-8',
          '.js': 'application/javascript; charset=UTF-8',
          '.css': 'text/css; charset=UTF-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.json': 'application/json',
          '.map': 'application/json',
        };
        res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        if (filePath === 'index.html' && shouldInjectEditMode) {
          res.end(injectEditModeScript(fs.readFileSync(resolvedPath, 'utf8')));
          return;
        }
        res.end(fs.readFileSync(resolvedPath));
      });
    },
  };
}

/**
 * Vite plugin: expose the Vue project's source files (src/, package.json,
 * vite.config.js, etc.) for the frontend code-tab file tree. Backend writes
 * the full project to {project_root}/tmp/code_output/vue_project_{appId}/
 * but the SSE stream only carries a markdown-embedded version of those
 * files, which is fragile to parse. This plugin reads straight from disk.
 *
 * Endpoints (dev-only):
 *   GET /__dev__/vue-files/{appId}/list   →  JSON [{ path, content }, ...]
 *   GET /__dev__/vue-files/{appId}/raw/{relativePath}  →  file content
 */
function vueSourceFilesPlugin(): Plugin {
  const CODE_OUTPUT_DIR = path.resolve(__dirname, '../tmp/code_output');

  // Skip these so the file tree stays focused on actual project sources
  const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.vscode']);
  const SOURCE_FILE_EXTS = new Set([
    '.vue', '.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css',
    '.scss', '.less', '.md', '.txt', '.env', '.gitignore',
  ]);

  function listProjectFiles(projectDir: string): { path: string; content: string }[] {
    if (!fs.existsSync(projectDir)) return [];
    const results: { path: string; content: string }[] = [];

    function walk(dir: string, prefix: string) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(full, rel);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          // Include only source-ish files; everything else (images, fonts,
          // sourcemaps) is noise for a code-tab viewer.
          if (!SOURCE_FILE_EXTS.has(ext) && !entry.name.startsWith('.')) continue;
          try {
            const content = fs.readFileSync(full, 'utf8');
            results.push({ path: rel, content });
          } catch {
            // skip files we can't read
          }
        }
      }
    }

    walk(projectDir, '');
    // Sort: directories first, then alphabetical
    results.sort((a, b) => {
      const aDepth = a.path.split('/').length;
      const bDepth = b.path.split('/').length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.path.localeCompare(b.path);
    });
    return results;
  }

  return {
    name: 'vue-source-files',
    configureServer(server) {
      server.middlewares.use('/__dev__/vue-files/', (req, res, next) => {
        const url = req.url || '';
        const pathname = url.split('?')[0];
        // /__dev__/vue-files/{appId}/list
        // /__dev__/vue-files/{appId}/raw/{relativePath...}
        const listMatch = pathname.match(/^\/([^/]+)\/list\/?$/);
        const rawMatch = pathname.match(/^\/([^/]+)\/raw\/(.+)$/);

        if (!listMatch && !rawMatch) return next();

        const appId = (listMatch ?? rawMatch)![1];
        if (appId.includes('..') || appId === '.' || appId === '') return next();
        const projectDir = path.join(CODE_OUTPUT_DIR, `vue_project_${appId}`);

        // Security: ensure projectDir stays within CODE_OUTPUT_DIR.
        const resolved = path.resolve(projectDir);
        const codeOutputResolved = path.resolve(CODE_OUTPUT_DIR);
        const rel = path.relative(codeOutputResolved, resolved);
        if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        if (listMatch) {
          const files = listProjectFiles(resolved);
          res.setHeader('Content-Type', 'application/json; charset=UTF-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(files));
          return;
        }

        if (rawMatch) {
          const relPath = rawMatch[2];
          const full = path.resolve(resolved, relPath);
          const fullRel = path.relative(resolved, full);
          if (fullRel === '' || fullRel.startsWith('..') || path.isAbsolute(fullRel)
              || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
          }
          res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(fs.readFileSync(full, 'utf8'));
          return;
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vuePreviewPlugin(), vueSourceFilesPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8911',
        changeOrigin: true,
      },
      // Static resources are served via /api/static/{deployKey}/
      // (handled by the /api proxy rule above since backend has context-path: /api)
    },
  },
})
