export type ValidationIssue = { code: string; message: string };

export function validateHtmlServer(text: string, fileName: string, sizeBytes: number) {
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];
  if (!fileName.toLowerCase().endsWith('.html')) issues.push({ code: 'INVALID_EXTENSION', message: '`.html` 파일만 올릴 수 있습니다.' });
  if (!text.trim() || sizeBytes === 0) issues.push({ code: 'EMPTY_FILE', message: '내용이 있는 HTML 파일을 선택해 주세요.' });
  if (sizeBytes > 1024 * 1024) issues.push({ code: 'FILE_TOO_LARGE', message: '파일 크기는 1MB 이하여야 합니다.' });
  if (!/<html[\s>]/i.test(text) || !/<body[\s>]/i.test(text)) issues.push({ code: 'INVALID_HTML', message: '`<html>`과 `<body>`가 들어간 파일을 선택해 주세요.' });
  if (!/<meta[^>]+charset=/i.test(text)) warnings.push('한글 표시를 위해 charset 메타 태그를 추가해 주세요.');
  if (!/<meta[^>]+name=["']viewport["']/i.test(text)) warnings.push('모바일 대응을 위해 viewport 메타 태그를 권장합니다.');
  const checks: Array<[RegExp, string, string]> = [
    [/<script\b[^>]+src\s*=\s*["'](?!data:|blob:)[^"']+/i, 'DISALLOWED_RESOURCE', 'JavaScript 코드를 index.html 안에 넣어 주세요.'],
    [/<link\b[^>]+href\s*=\s*["'](?!data:|blob:)[^"']+/i, 'DISALLOWED_RESOURCE', '스타일과 폰트도 index.html 안에 넣어 주세요.'],
    [/<(?:img|audio|video|source)\b[^>]+src\s*=\s*["'](?:https?:|\/\/)/i, 'DISALLOWED_RESOURCE', '이미지와 미디어는 data URL로 넣어 주세요.'],
    [/@import\s+[^;]*(?:https?:|\/\/)/i, 'DISALLOWED_RESOURCE', 'CSS는 `<style>` 태그 안에 넣어 주세요.'],
    [/url\(\s*["']?(?:https?:|\/\/)/i, 'DISALLOWED_RESOURCE', 'CSS 리소스도 index.html 안에 넣어 주세요.'],
    [/<(?:iframe|object|embed|form|base)\b/i, 'DISALLOWED_ELEMENT', '폼과 프레임, 객체 삽입을 빼고 구성해 주세요.'],
    [/<meta\b[^>]+http-equiv\s*=\s*["']refresh/i, 'DISALLOWED_NAVIGATION', '자동 이동 코드를 빼 주세요.'],
    [/(?:href|src)\s*=\s*["']\s*javascript:/i, 'DISALLOWED_NAVIGATION', '링크에는 일반 주소를 넣어 주세요.'],
    [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*[(.]/i, 'DISALLOWED_NETWORK', '네트워크 요청을 빼고 한 파일 안에서 완성해 주세요.'],
  ];
  for (const [pattern, code, message] of checks) if (pattern.test(text)) issues.push({ code, message });
  if (/<a\b[^>]+href\s*=\s*["'](?:https?:|\/\/)/i.test(text)) warnings.push('외부 링크는 격리된 결과 화면에서 열립니다.');
  return { issues: Array.from(new Map(issues.map((item) => [item.code, item])).values()), warnings: Array.from(new Set(warnings)) };
}

export function injectContentPolicy(html: string) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; media-src data: blob:";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (match) => `${match}${meta}`) : `${meta}${html}`;
}
