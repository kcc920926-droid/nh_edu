import { injectContentPolicy } from '@/lib/html-validation';
import { getStore } from '@/lib/server-store';

function escapeAttribute(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function resultHeaders() { return new Headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; frame-ancestors 'none'" }); }
function expired() { return new Response('<!doctype html><title>결과 만료</title><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;color:#172b45;background:#fbfcfd}main{text-align:center}p{color:#6e7d8e}</style><main><h1>결과물이 만료되었습니다.</h1><p>교육용 게시 결과는 7일 뒤 자동 삭제됩니다.</p></main>', { status: 404, headers: resultHeaders() }); }

export async function GET(_request: Request, context: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await context.params;
  if (!/^[A-Za-z0-9_-]{12,30}$/.test(pageId)) return expired();
  let html = '';
  try {
    const store = await getStore();
    const page = await store.getPage(pageId);
    if (!page) return expired();
    html = page.html;
  } catch {
    return expired();
  }
  const inner = escapeAttribute(injectContentPolicy(html));
  const wrapper = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>교육생 결과물</title><style>html,body{margin:0;min-height:100%;background:#f4f7f9}body{font-family:system-ui,-apple-system,"Segoe UI","Noto Sans KR",sans-serif;color:#172b45}.notice{height:34px;box-sizing:border-box;padding:0 16px;display:flex;align-items:center;justify-content:center;background:#172b45;color:#e7eff9;font-size:11px;letter-spacing:.02em}.notice strong{color:#fff;margin-right:5px}.stage{height:calc(100vh - 34px);min-height:320px}.stage iframe{display:block;width:100%;height:100%;border:0;background:#fff}</style></head><body><div class="notice"><strong>교육생이 만든 콘텐츠</strong> 개인정보를 입력하지 마세요.</div><div class="stage"><iframe title="교육생이 만든 웹페이지" sandbox="allow-scripts allow-top-navigation-by-user-activation" referrerpolicy="no-referrer" srcdoc="${inner}"></iframe></div></body></html>`;
  return new Response(wrapper, { status: 200, headers: resultHeaders() });
}
