export type ValidationIssue = { code: string; message: string };

export function validateHtmlServer(text: string, fileName: string, sizeBytes: number) {
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];
  if (!fileName.toLowerCase().endsWith('.html')) issues.push({ code: 'INVALID_EXTENSION', message: '`.html` 파일만 올릴 수 있습니다.' });
  if (!text.trim() || sizeBytes === 0) issues.push({ code: 'EMPTY_FILE', message: '빈 파일은 올릴 수 없습니다.' });
  if (sizeBytes > 1024 * 1024) issues.push({ code: 'FILE_TOO_LARGE', message: '파일 크기는 1MB 이하여야 합니다.' });
  if (!/<html[\s>]/i.test(text) || !/<body[\s>]/i.test(text)) issues.push({ code: 'INVALID_HTML', message: '완전한 HTML 문서(`<html>`, `<body>`)가 필요합니다.' });
  if (!/<meta[^>]+charset=/i.test(text)) warnings.push('문자 인코딩 선언이 없어 브라우저에 따라 한글이 다르게 보일 수 있습니다.');
  if (!/<meta[^>]+name=["']viewport["']/i.test(text)) warnings.push('모바일 대응을 위해 viewport 메타 태그를 권장합니다.');
  const checks: Array<[RegExp, string, string]> = [
    [/<script\b[^>]+src\s*=\s*["'](?!data:|blob:)[^"']+/i, 'DISALLOWED_RESOURCE', '외부 JavaScript는 사용할 수 없습니다. 코드를 index.html 안에 작성하세요.'],
    [/<link\b[^>]+href\s*=\s*["'](?!data:|blob:)[^"']+/i, 'DISALLOWED_RESOURCE', '외부 스타일·폰트·리소스는 사용할 수 없습니다.'],
    [/<(?:img|audio|video|source)\b[^>]+src\s*=\s*["'](?:https?:|\/\/)/i, 'DISALLOWED_RESOURCE', '외부 이미지·미디어 주소는 사용할 수 없습니다. data URL을 사용하세요.'],
    [/@import\s+[^;]*(?:https?:|\/\/)/i, 'DISALLOWED_RESOURCE', '외부 CSS import는 사용할 수 없습니다.'],
    [/url\(\s*["']?(?:https?:|\/\/)/i, 'DISALLOWED_RESOURCE', '외부 CSS 리소스는 사용할 수 없습니다.'],
    [/<(?:iframe|object|embed|form|base)\b/i, 'DISALLOWED_ELEMENT', '폼·프레임·객체 삽입은 안전을 위해 사용할 수 없습니다.'],
    [/<meta\b[^>]+http-equiv\s*=\s*["']refresh/i, 'DISALLOWED_NAVIGATION', '자동 리다이렉트는 사용할 수 없습니다.'],
    [/(?:href|src)\s*=\s*["']\s*javascript:/i, 'DISALLOWED_NAVIGATION', '`javascript:` 링크는 사용할 수 없습니다.'],
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*[(.]/i, 'DISALLOWED_NETWORK', '외부 네트워크 요청 코드는 사용할 수 없습니다.'],
  ];
  for (const [pattern, code, message] of checks) if (pattern.test(text)) issues.push({ code, message });
  if (/<a\b[^>]+href\s*=\s*["'](?:https?:|\/\/)/i.test(text)) warnings.push('외부 링크는 결과 화면의 안전한 격리 영역 안에서 열립니다.');
  return { issues: Array.from(new Map(issues.map((item) => [item.code, item])).values()), warnings: Array.from(new Set(warnings)) };
}

export function injectContentPolicy(html: string) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; media-src data: blob:";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (match) => `${match}${meta}`) : `${meta}${html}`;
}
