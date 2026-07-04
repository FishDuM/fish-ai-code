/**
 * Error thrown by the response interceptor when the backend returns a
 * non-zero business code. Carries the original code so consumers can react
 * (e.g. show a specific message) without losing the typed surface.
 */
export class ApiError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}