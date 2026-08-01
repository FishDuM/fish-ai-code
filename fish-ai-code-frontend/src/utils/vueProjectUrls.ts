import { API_BASE_URL } from '@/constants';

/**
 * Vue 项目源码文件清单接口：dev 与生产统一走后端静态资源接口
 * （原 dev-only Vite 插件在 nginx 部署下无路由，导致生产文件树为空）。
 * 鉴权与预览一致：URL 携带 previewToken 或 session cookie。
 */
export function getVueFilesListUrl(appId: string): string | null {
  if (!appId) return null;
  return `${API_BASE_URL}/static/vue_project_${appId}/__list__`;
}
