/**
 * Map a file extension (or hint like "vue") to a Prism language identifier
 * accepted by react-syntax-highlighter.
 *
 * Falls back to undefined for unknown extensions, which signals "no language"
 * — the highlighter will still render the code but without token coloring.
 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  // Web
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  vue: 'markup',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  json: 'json',
  jsonc: 'json',
  // Shell / config
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'yaml',
  ini: 'ini',
  env: 'bash',
  // Backend-ish
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sql: 'sql',
  // Other
  md: 'markdown',
  markdown: 'markdown',
  dockerfile: 'docker',
};

/**
 * Resolve a language hint for the highlighter. Accepts either a file
 * extension (`"ts"`) or an already-named language (`"typescript"`).
 * Returns undefined when no mapping matches.
 */
export function resolveLanguage(hint?: string | null): string | undefined {
  if (!hint) return undefined;
  const key = hint.toLowerCase().replace(/^\./, '');
  return EXT_TO_LANGUAGE[key];
}