const ANSI_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

const AUTHORIZATION_PATTERN = /\b(authorization\s*:\s*)(?:bearer\s+)?[^\s,;]+/gi;
const BEARER_PATTERN = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(token|access[_-]?token|refresh[_-]?token|password|passwd|pwd|cookie|client[_-]?secret|api[_-]?key)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const URL_SECRET_PATTERN = /([?&](?:token|access_token|password|client_secret|api_key)=)[^&#\s]+/gi;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

export function redactText(value: string): string {
  return value
    .replace(AUTHORIZATION_PATTERN, '$1[REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, '$1$2[REDACTED]')
    .replace(URL_SECRET_PATTERN, '$1[REDACTED]');
}

export function sanitizeLogText(value: string): string {
  return redactText(stripAnsi(value).replace(/\r\n?/g, '\n'));
}
