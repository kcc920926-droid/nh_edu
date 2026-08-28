// 여러 파일(index.html + style.css + script.js + 이미지)을
// 게시 파이프라인이 받는 단일 self-contained index.html로 합친다. 브라우저 전용.

export type BundleOutcome = { file: File; text: string; parts: string[] };

const MAX_BUNDLE_BYTES = 1024 * 1024;
const MAX_FILES = 60;
const IGNORED_NAMES = /^(?:\.|thumbs\.db$|desktop\.ini$)/i;
const CSS_EXTS = new Set(['css']);
const JS_EXTS = new Set(['js', 'mjs']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);
const FONT_EXTS = new Set(['woff', 'woff2', 'ttf', 'otf']);
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp', avif: 'image/avif',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
};

function baseName(value: string) { return value.split(/[\\/]/).pop() ?? value; }
function extOf(name: string) { const match = /\.([a-z0-9]+)$/i.exec(name); return match ? match[1].toLowerCase() : ''; }

async function toDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  const mime = MIME_BY_EXT[extOf(file.name)] || file.type || 'application/octet-stream';
  return `data:${mime};base64,${btoa(binary)}`;
}

async function replaceAsync(input: string, pattern: RegExp, replacer: (...args: string[]) => Promise<string>) {
  const tasks: Array<Promise<string>> = [];
  input.replace(pattern, (...args) => { tasks.push(replacer(...(args as unknown as string[]))); return ''; });
  const replacements = await Promise.all(tasks);
  let cursor = 0;
  return input.replace(pattern, () => replacements[cursor++]);
}

export async function bundleUpload(input: File[]): Promise<BundleOutcome> {
  const files = input.filter((item) => item.size > 0 && !IGNORED_NAMES.test(baseName(item.name))).slice(0, MAX_FILES);
  if (!files.length) throw new Error('올릴 파일을 찾지 못했어요. index.html이 들어 있는지 확인해 주세요.');

  const htmlFiles = files.filter((item) => ['html', 'htm'].includes(extOf(item.name)));
  const htmlFile = htmlFiles.find((item) => baseName(item.name).toLowerCase() === 'index.html') ?? (htmlFiles.length === 1 ? htmlFiles[0] : undefined);
  if (!htmlFile) throw new Error(htmlFiles.length ? 'HTML 파일이 여러 개예요. index.html 하나만 남겨 주세요.' : 'index.html 파일이 필요해요. 폴더 안에 index.html이 있는지 확인해 주세요.');

  const assets = new Map<string, File>();
  for (const item of files) {
    if (item === htmlFile) continue;
    const ext = extOf(item.name);
    if (CSS_EXTS.has(ext) || JS_EXTS.has(ext) || IMAGE_EXTS.has(ext) || FONT_EXTS.has(ext)) assets.set(baseName(item.name).toLowerCase(), item);
  }

  const used = new Set<string>();
  const dataUrlCache = new Map<string, Promise<string>>();
  const dataUrlFor = (key: string) => { let cached = dataUrlCache.get(key); if (!cached) { cached = toDataUrl(assets.get(key)!); dataUrlCache.set(key, cached); } return cached; };
  const resolveAsset = (ref: string) => {
    const clean = ref.trim().replace(/^["']|["']$/g, '').split(/[?#]/)[0];
    if (!clean || /^(?:data:|blob:|https?:|\/\/)/i.test(clean)) return null;
    const key = baseName(clean).toLowerCase();
    return assets.has(key) ? key : null;
  };

  // CSS 안의 url(...) 참조(이미지·폰트)를 data URL로 치환
  const inlineCssRefs = (css: string) => replaceAsync(css, /url\(\s*([^)]+?)\s*\)/gi, async (match, ref) => {
    const key = resolveAsset(ref);
    if (!key || (!IMAGE_EXTS.has(extOf(key)) && !FONT_EXTS.has(extOf(key)))) return match;
    used.add(key);
    return `url(${await dataUrlFor(key)})`;
  });

  let html = await htmlFile.text();

  // 1) <link href="style.css"> → <style>…</style>
  html = await replaceAsync(html, /<link\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi, async (match, href) => {
    const key = resolveAsset(href);
    if (!key || !CSS_EXTS.has(extOf(key))) return match;
    used.add(key);
    const css = await assets.get(key)!.text();
    return `<style>\n${await inlineCssRefs(css)}\n</style>`;
  });

  // 2) <script src="script.js"></script> → <script>…</script>
  html = await replaceAsync(html, /<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi, async (match, src) => {
    const key = resolveAsset(src);
    if (!key || !JS_EXTS.has(extOf(key))) return match;
    used.add(key);
    const js = (await assets.get(key)!.text()).replace(/<\/script/gi, '<\\/script');
    return `<script>\n${js}\n</script>`;
  });

  // 3) img/src·poster 속성의 로컬 이미지 → data URL
  html = await replaceAsync(html, /\b(src|poster)\s*=\s*["']([^"']+)["']/gi, async (match, attr, ref) => {
    const key = resolveAsset(ref);
    if (!key || !IMAGE_EXTS.has(extOf(key))) return match;
    used.add(key);
    return `${attr}="${await dataUrlFor(key)}"`;
  });

  // 4) 인라인 <style> 블록에 남은 url(...) 참조 처리
  html = await inlineCssRefs(html);

  const bundledSize = new Blob([html]).size;
  if (bundledSize > MAX_BUNDLE_BYTES) throw new Error('파일을 합친 결과가 1MB를 넘어요. 이미지를 줄이거나 빼 주세요.');

  const parts = ['index.html', ...Array.from(used).sort()];
  return { file: new File([html], 'index.html', { type: 'text/html' }), text: html, parts };
}
