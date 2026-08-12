export const API_BASE_URL = '/api';

export const ERROR_CODES = {
  SUCCESS: 0,
  PARAMS_ERROR: 40000,
  CAPTCHA_ERROR: 40010,
  NOT_LOGIN_ERROR: 40100,
  NO_AUTH_ERROR: 40101,
  FORBIDDEN_ERROR: 40300,
  NOT_FOUND_ERROR: 40400,
  TOO_MANY_REQUEST: 42900,
  SYSTEM_ERROR: 50000,
  OPERATION_ERROR: 50001,
} as const;

export const CODE_GEN_TYPES = {
  HTML: 'html',
  MULTI_FILE: 'multi_file',
  VUE_PROJECT: 'vue_project',
} as const;

export const FEATURED_PRIORITY = 99;

// 新增用户的默认密码（与后端 UserConstant.DEFAULT_PASSWORD 保持一致）
export const DEFAULT_PASSWORD = '12345678';

export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
} as const;

export const APP_NAME = 'Fish AI Code';
