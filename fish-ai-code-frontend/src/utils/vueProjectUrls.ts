import { API_BASE_URL } from '@/constants';

export function getVuePreviewBaseUrl(appId: string): string {
  if (import.meta.env.DEV) {
    return `/vue-preview/${appId}/`;
  }
  return `${API_BASE_URL}/static/vue_project_${appId}/dist/`;
}

export function getVueFilesListUrl(appId: string): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  return `/__dev__/vue-files/${appId}/list`;
}
