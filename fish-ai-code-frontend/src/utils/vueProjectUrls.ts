export function getVueFilesListUrl(appId: string): string | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  return `/__dev__/vue-files/${appId}/list`;
}
