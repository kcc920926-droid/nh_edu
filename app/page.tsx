'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';

type Step = 'welcome' | 'learn' | 'builder' | 'agent' | 'revise' | 'upload' | 'complete';
type IconName =
  | 'spark' | 'arrow' | 'calendar' | 'checklist' | 'dashboard' | 'users' | 'user'
  | 'palette' | 'wand' | 'copy' | 'check' | 'upload' | 'desktop' | 'mobile'
  | 'external' | 'refresh' | 'warning' | 'back' | 'lock' | 'link' | 'chevron';
type Selection = { pageType: string; audience: string; design: string; features: string[] };
type Validation = { issues: string[]; warnings: string[] };
type Published = { pageId: string; url: string; createdAt: string; expiresAt: string };

const MAX_BYTES = 1024 * 1024;
const BUILDER_KEY = 'ai-lab-builder-code-v1';
const RESULT_KEY = 'ai-lab-latest-result-v1';
const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const pageTypes = [
  { id: 'event', title: '행사·교육 안내', description: '일정과 프로그램을 한눈에 보여주는 안내 페이지', icon: 'calendar' as IconName, goal: '행사 참가자를 위한 일정과 참여 안내 웹페이지를 만든다.', required: ['행사 제목', '일시와 장소', '주요 프로그램', '준비물', '문의 안내'], defaultAudience: 'attendees', defaultDesign: 'friendly', defaultFeatures: ['tabs'] },
  { id: 'checklist', title: '업무 체크리스트', description: '반복 업무를 단계별로 확인하는 페이지', icon: 'checklist' as IconName, goal: '사내 직원이 업무를 단계별로 확인하고 완료할 수 있는 체크리스트 웹페이지를 만든다.', required: ['업무 목적', '단계별 체크 항목', '주의사항', '완료 상태', '전체 진행률'], defaultAudience: 'employees', defaultDesign: 'work', defaultFeatures: ['check', 'progress'] },
  { id: 'dashboard', title: '현황 대시보드', description: '핵심 지표와 상태를 빠르게 파악하는 화면', icon: 'dashboard' as IconName, goal: '팀의 주요 현황을 빠르게 파악할 수 있는 업무 대시보드 웹페이지를 만든다.', required: ['주요 지표 카드', '상태별 현황', '간단한 차트', '최근 항목 목록'], defaultAudience: 'employees', defaultDesign: 'cards', defaultFeatures: ['filter', 'chart'] },
] as const;
const audiences = [
  { id: 'employees', title: '사내 직원', description: '업무 중 바로 사용하는 구성원', icon: 'users' as IconName },
  { id: 'new-hires', title: '신규 직원', description: '처음 업무를 시작하는 동료', icon: 'user' as IconName },
  { id: 'customers', title: '고객', description: '서비스를 이용하는 외부 사용자', icon: 'user' as IconName },
  { id: 'attendees', title: '행사 참가자', description: '일정과 준비물을 확인하는 사람', icon: 'calendar' as IconName },
  { id: 'public', title: '일반 사용자', description: '누구나 이해해야 하는 방문자', icon: 'link' as IconName },
] as const;
const designs = [
  { id: 'work', title: '깔끔한 업무형', description: '정보를 빠르게 찾는 절제된 레이아웃', icon: 'checklist' as IconName },
  { id: 'friendly', title: '밝고 친근한 스타일', description: '처음 보는 사람도 편안한 화면', icon: 'spark' as IconName },
  { id: 'tech', title: '어두운 테크 스타일', description: '집중도 높은 다크톤 인터페이스', icon: 'wand' as IconName },
  { id: 'cards', title: '카드 중심 대시보드', description: '숫자와 상태를 카드로 정리', icon: 'dashboard' as IconName },
  { id: 'guide', title: '큰 글씨의 안내형', description: '모바일에서도 읽기 쉬운 구성', icon: 'mobile' as IconName },
] as const;
const features = [
  { id: 'tabs', title: '탭 전환', description: '섹션을 나누어 보여주기', icon: 'chevron' as IconName },
  { id: 'check', title: '체크리스트', description: '완료 항목을 직접 체크하기', icon: 'checklist' as IconName },
  { id: 'progress', title: '진행률', description: '완료 비율을 자동 표시하기', icon: 'dashboard' as IconName },
  { id: 'filter', title: '필터', description: '상태별 항목을 골라 보기', icon: 'link' as IconName },
  { id: 'dark', title: '다크 모드', description: '밝기 테마를 전환하기', icon: 'wand' as IconName },
  { id: 'chart', title: '간단한 차트', description: '숫자를 시각적으로 비교하기', icon: 'dashboard' as IconName },
  { id: 'print', title: '인쇄 버튼', description: '화면을 문서로 출력하기', icon: 'desktop' as IconName },
  { id: 'motion', title: '부드러운 애니메이션', description: '상태 변화를 자연스럽게 보여주기', icon: 'spark' as IconName },
] as const;
const slides = [
  { kicker: '01 / 시작', title: '코딩을 몰라도 웹페이지를 만들 수 있을까?', body: '오늘은 HTML 문법을 외우지 않습니다. 만들고 싶은 결과를 말로 설명하고, AI가 파일로 만드는 과정을 직접 경험합니다.', stat: '목표는 문법이 아니라 경험입니다.' },
  { kicker: '02 / 차이', title: '생성형 AI와 에이전틱 코딩은 무엇이 다를까요?', body: '일반 AI가 답변을 만들어 준다면, 에이전트는 정해진 작업 공간에서 파일을 만들고 실행 결과까지 확인합니다.', stat: '사람은 방향을, 에이전트는 파일을 담당합니다.' },
  { kicker: '03 / 역할', title: '사람이 목표를 정하고 에이전트가 파일을 만듭니다.', body: '좋은 결과를 위해서는 무엇을 만들지, 누가 볼지, 어떤 내용을 넣을지, 어떻게 보여줄지를 정하면 됩니다.', stat: '목표 → 내용 → 형태 → 확인' },
  { kicker: '04 / 요청', title: '좋은 요청을 만드는 네 가지 요소', body: '무엇을 만들 것인가 · 누가 볼 것인가 · 어떤 내용을 넣을 것인가 · 어떤 형태로 보여줄 것인가. 이 네 가지면 충분합니다.', stat: '짧고 구체적으로 말해 보세요.' },
  { kicker: '05 / 결과', title: '오늘 만들 수 있는 결과물', body: '행사 안내, 업무 체크리스트, 현황 대시보드 중 하나를 골라 실제로 브라우저에서 열리는 페이지를 만듭니다.', stat: '세 가지 모두 단일 index.html로 완성됩니다.' },
  { kicker: '06 / 반복', title: '선택 → 생성 → 수정 → 게시', body: '첫 결과가 완벽하지 않아도 괜찮습니다. 화면을 보고 수정 요청을 한 뒤, 완성된 파일을 업로드해 공개합니다.', stat: '반복할수록 에이전틱 작업이 됩니다.' },
  { kicker: '07 / 실습', title: '이제 직접 만들어 보겠습니다.', body: '페이지 종류와 사용자를 고르면 바로 붙여 넣을 수 있는 Antigravity 프롬프트가 완성됩니다.', stat: '준비되면 다음 단계로 이동하세요.' },
] as const;
const revisionOptions = [
  { id: 'larger', title: '글씨를 더 크게', text: '전체 글씨를 조금 더 크게 만든다.' },
  { id: 'brighter', title: '색상을 더 밝게', text: '배경과 주요 색상을 더 밝고 편안하게 조정한다.' },
  { id: 'button', title: '버튼을 더 눈에 띄게', text: '주요 버튼이 첫 화면에서 더 잘 보이게 한다.' },
  { id: 'spacing', title: '카드 간격을 넓게', text: '모바일에서 카드 사이 간격을 넉넉하게 만든다.' },
  { id: 'shorter', title: '내용을 간결하게', text: '중복 문장을 줄이고 핵심 내용만 남긴다.' },
  { id: 'mobile', title: '모바일 화면 개선', text: '작은 화면에서 읽기와 터치가 편하도록 레이아웃을 개선한다.' },
] as const;

function makeBuilderCode() {
  const values = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(values);
  return `BUILDER ${Array.from(values, (value) => SAFE_ALPHABET[value % SAFE_ALPHABET.length]).join('')}`;
}

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'spark': return <svg {...common}><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>;
    case 'arrow': return <svg {...common}><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>;
    case 'calendar': return <svg {...common}><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M7 3v3M17 3v3M3 9h18" /><path d="M7 13h3M14 13h3M7 17h3" /></svg>;
    case 'checklist': return <svg {...common}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m7 8 1.5 1.5L11 7M13 9h4M7 14l1.5 1.5L11 13M13 15h4" /></svg>;
    case 'dashboard': return <svg {...common}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></svg>;
    case 'users': return <svg {...common}><path d="M16 20v-1.4a4.1 4.1 0 0 0-4.1-4.1H7.1A4.1 4.1 0 0 0 3 18.6V20" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M16 4.2a3.5 3.5 0 0 1 0 6.7M21 20v-1.4a4.1 4.1 0 0 0-3.1-4" /></svg>;
    case 'user': return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
    case 'palette': return <svg {...common}><path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3.5a5.5 5.5 0 0 0 0-11H12Z" /><circle cx="7.5" cy="9" r=".8" fill="currentColor" /><circle cx="11" cy="6.5" r=".8" fill="currentColor" /><circle cx="15" cy="7" r=".8" fill="currentColor" /></svg>;
    case 'wand': return <svg {...common}><path d="m15 4 5 5M13 6l5 5M4 20 17 7" /><path d="m5 5 .6 1.9L7.5 7.5l-1.9.6L5 10l-.6-1.9-1.9-.6 1.9-.6L5 5ZM19 15l.5 1.5L21 17l-1.5.5L19 19l-.5-1.5L17 17l1.5-.5L19 15Z" /></svg>;
    case 'copy': return <svg {...common}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
    case 'check': return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
    case 'upload': return <svg {...common}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>;
    case 'desktop': return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
    case 'mobile': return <svg {...common}><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></svg>;
    case 'external': return <svg {...common}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></svg>;
    case 'refresh': return <svg {...common}><path d="M20 11a8 8 0 0 0-14.7-3L3 10" /><path d="M3 5v5h5M4 13a8 8 0 0 0 14.7 3L21 14" /><path d="M21 19v-5h-5" /></svg>;
    case 'warning': return <svg {...common}><path d="m12 3 9 17H3L12 3Z" /><path d="M12 9v5M12 17.5v.1" /></svg>;
    case 'back': return <svg {...common}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
    case 'lock': return <svg {...common}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case 'link': return <svg {...common}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1L11 5" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 7 20l1-1" /></svg>;
    case 'chevron': return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
  }
}

function validateHtml(text: string, fileName = 'index.html', fileSize = new Blob([text]).size): Validation {
  const issues: string[] = [];
  const warnings: string[] = [];
  if (!fileName.toLowerCase().endsWith('.html')) issues.push('`.html` 파일만 올릴 수 있습니다.');
  if (fileSize === 0 || !text.trim()) issues.push('빈 파일은 올릴 수 없습니다.');
  if (fileSize > MAX_BYTES) issues.push('파일 크기는 1MB 이하여야 합니다.');
  if (!/<html[\s>]/i.test(text) || !/<body[\s>]/i.test(text)) issues.push('완전한 HTML 문서(`<html>`, `<body>`)가 필요합니다.');
  if (!/<meta[^>]+charset=/i.test(text)) warnings.push('문자 인코딩 선언이 없어 브라우저에 따라 한글이 다르게 보일 수 있습니다.');
  if (!/<meta[^>]+name=["']viewport["']/i.test(text)) warnings.push('모바일 대응을 위해 viewport 메타 태그를 권장합니다.');
  const resourcePatterns = [
    { pattern: /<script\b[^>]+src\s*=\s*["'](?!data:|blob:)[^"']+/i, message: '외부 JavaScript는 사용할 수 없습니다. 코드를 index.html 안에 작성하세요.' },
    { pattern: /<link\b[^>]+href\s*=\s*["'](?!data:|blob:)[^"']+/i, message: '외부 스타일·폰트·리소스는 사용할 수 없습니다.' },
    { pattern: /<(?:img|audio|video|source)\b[^>]+src\s*=\s*["'](?:https?:|\/\/)/i, message: '외부 이미지·미디어 주소는 사용할 수 없습니다. data URL을 사용하세요.' },
    { pattern: /@import\s+[^;]*(?:https?:|\/\/)/i, message: '외부 CSS import는 사용할 수 없습니다.' },
    { pattern: /url\(\s*["']?(?:https?:|\/\/)/i, message: '외부 CSS 리소스는 사용할 수 없습니다.' },
    { pattern: /<(?:iframe|object|embed|form|base)\b/i, message: '폼·프레임·객체 삽입은 안전을 위해 사용할 수 없습니다.' },
    { pattern: /<meta\b[^>]+http-equiv\s*=\s*["']refresh/i, message: '자동 리다이렉트는 사용할 수 없습니다.' },
    { pattern: /(?:href|src)\s*=\s*["']\s*javascript:/i, message: '`javascript:` 링크는 사용할 수 없습니다.' },
    { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*[(.]/i, message: '외부 네트워크 요청 코드는 사용할 수 없습니다.' },
  ];
  for (const item of resourcePatterns) if (item.pattern.test(text)) issues.push(item.message);
  if (/<a\b[^>]+href\s*=\s*["'](?:https?:|\/\/)/i.test(text)) warnings.push('외부 링크는 결과 화면의 안전한 격리 영역 안에서 열립니다.');
  return { issues: Array.from(new Set(issues)), warnings: Array.from(new Set(warnings)) };
}

function injectPreviewPolicy(html: string) {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'; media-src data: blob:";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (match) => `${match}${meta}`) : `${meta}${html}`;
}
function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = document.createElement('textarea'); textarea.value = value; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove(); return Promise.resolve();
}
function formatDate(value: string) { try { return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); } catch { return value; } }

function TopBar({ step, onReset }: { step: Step; onReset: () => void }) {
  const steps: Array<{ key: Step; label: string }> = [{ key: 'learn', label: '개념' }, { key: 'builder', label: '선택' }, { key: 'agent', label: '생성' }, { key: 'upload', label: '게시' }];
  const active = steps.findIndex((item) => item.key === step);
  return <header className="topbar"><button className="brand" type="button" onClick={onReset} aria-label="처음 화면으로"><span className="brand-mark"><Icon name="spark" size={18} /></span><span><strong>AI AGENTIC</strong><small>CODING LAB</small></span></button><div className="top-progress" aria-label="실습 진행 상태">{steps.map((item, index) => <div className={`top-step ${index <= active && active >= 0 ? 'is-active' : ''} ${item.key === step ? 'is-current' : ''}`} key={item.key}><span>{String(index + 1).padStart(2, '0')}</span>{item.label}</div>)}</div><div className="top-status"><span className="status-dot" /> 브라우저에서 바로 실습</div></header>;
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lead">{description}</p></div>{action}</div>; }
function SelectionCard({ selected, onClick, icon, title, description, compact = false }: { selected: boolean; onClick: () => void; icon: IconName; title: string; description: string; compact?: boolean }) { return <button type="button" className={`selection-card ${compact ? 'is-compact' : ''} ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={onClick}><span className="card-icon"><Icon name={icon} /></span><span className="card-copy"><strong>{title}</strong><small>{description}</small></span><span className="card-check">{selected ? <Icon name="check" size={16} /> : null}</span></button>; }

function Welcome({ builderCode, latest, onStart, onOpenLatest }: { builderCode: string; latest: Published | null; onStart: () => void; onOpenLatest: () => void }) {
  return <main className="welcome-shell">
    <div className="clay-orb clay-orb-one" aria-hidden="true" />
    <div className="clay-orb clay-orb-two" aria-hidden="true" />
    <div className="welcome-grid">
      <section className="welcome-copy">
        <p className="eyebrow">FIRST AGENTIC BUILD / 40 MIN LAB</p>
        <h1><em>AI와 만드는</em><br />첫 웹페이지.</h1>
        <div className="builder-badge">
          <span className="badge-label">YOUR BUILDER CODE</span>
          <strong>{builderCode}</strong>
          <small>Your first agentic build</small>
        </div>
        <button className="primary-button large" type="button" onClick={onStart}>실습 시작하기 <Icon name="arrow" size={19} /></button>
        {latest ? <button className="latest-link" type="button" onClick={onOpenLatest}><Icon name="link" size={15} /> 최근 게시 결과 열기 <span>{formatDate(latest.createdAt)}</span></button> : null}
      </section>
      <section className="welcome-panel" aria-label="실습 흐름">
        <div className="panel-label">TODAY&apos;S FLOW</div>
        <div className="flow-list">
          <div className="flow-item"><span>01</span><span className="flow-icon"><Icon name="palette" /></span><div><strong>선택</strong><small>만들 페이지와 분위기를 고릅니다.</small></div></div>
          <div className="flow-line" />
          <div className="flow-item"><span>02</span><span className="flow-icon"><Icon name="wand" /></span><div><strong>생성</strong><small>Antigravity가 index.html을 만듭니다.</small></div></div>
          <div className="flow-line" />
          <div className="flow-item"><span>03</span><span className="flow-icon"><Icon name="upload" /></span><div><strong>게시</strong><small>URL과 QR로 결과를 공유합니다.</small></div></div>
        </div>
      </section>
    </div>
    <div className="welcome-footer"><span>AX 테크선도팀</span></div>
  </main>;
}

function Learn({ index, setIndex, onNext }: { index: number; setIndex: (value: number) => void; onNext: () => void }) { const slide = slides[index]; return <main className="app-shell"><PageHeading eyebrow={`ORIENTATION / ${slide.kicker}`} title={slide.title} description={slide.body} action={<div className="slide-count"><strong>{String(index + 1).padStart(2, '0')}</strong><span>/ 07</span></div>} /><section className="learning-stage"><div className="learning-card"><div className="learning-number">{String(index + 1).padStart(2, '0')}</div><div className="learning-content"><p className="eyebrow">{slide.kicker}</p><h2>{slide.title}</h2><p>{slide.body}</p><div className="learning-stat"><span className="stat-line" />{slide.stat}</div></div><div className="learning-orbit"><span /><span /><span /></div></div><div className="slide-dots" role="tablist" aria-label="개념 슬라이드">{slides.map((item, itemIndex) => <button type="button" role="tab" aria-selected={itemIndex === index} aria-label={`${itemIndex + 1}번째 슬라이드`} className={itemIndex === index ? 'is-active' : ''} onClick={() => setIndex(itemIndex)} key={item.kicker} />)}</div></section><div className="page-actions"><button className="text-button" type="button" onClick={() => index > 0 && setIndex(index - 1)} disabled={index === 0}><Icon name="back" size={17} /> 이전</button>{index < slides.length - 1 ? <button className="primary-button" type="button" onClick={() => setIndex(index + 1)}>다음 슬라이드 <Icon name="arrow" size={17} /></button> : <button className="primary-button" type="button" onClick={onNext}>직접 만들어 보기 <Icon name="arrow" size={17} /></button>}</div></main>; }

function Builder({ selection, setSelection, prompt, copied, onCopy, onNext }: { selection: Selection; setSelection: React.Dispatch<React.SetStateAction<Selection>>; prompt: string; copied: boolean; onCopy: () => void; onNext: () => void }) { const page = pageTypes.find((item) => item.id === selection.pageType); const toggleFeature = (id: string) => setSelection((current) => ({ ...current, features: current.features.includes(id) ? current.features.filter((item) => item !== id) : current.features.length < 3 ? [...current.features, id] : current.features })); return <main className="app-shell builder-shell"><PageHeading eyebrow="BUILD / 01 — CHOOSE YOUR DIRECTION" title="무엇을 만들어 볼까요?" description="카드를 고르면 Antigravity가 이해할 수 있는 작업 요청으로 정리됩니다." /><div className="builder-layout"><section className="builder-selections"><div className="selection-section"><div className="section-heading"><span className="section-index">01</span><div><h2>만들 페이지</h2><p>하나를 선택하세요.</p></div></div><div className="card-grid page-grid">{pageTypes.map((item) => <SelectionCard key={item.id} selected={selection.pageType === item.id} onClick={() => setSelection({ pageType: item.id, audience: item.defaultAudience, design: item.defaultDesign, features: [...item.defaultFeatures] })} icon={item.icon} title={item.title} description={item.description} />)}</div></div><div className="selection-section"><div className="section-heading"><span className="section-index">02</span><div><h2>누가 보나요?</h2><p>페이지를 사용할 사람을 고르세요.</p></div></div><div className="card-grid compact-grid">{audiences.map((item) => <SelectionCard key={item.id} selected={selection.audience === item.id} onClick={() => setSelection((current) => ({ ...current, audience: item.id }))} icon={item.icon} title={item.title} description={item.description} compact />)}</div></div><div className="selection-section"><div className="section-heading"><span className="section-index">03</span><div><h2>어떤 분위기인가요?</h2><p>내용을 보여주는 방식을 고르세요.</p></div></div><div className="card-grid compact-grid">{designs.map((item) => <SelectionCard key={item.id} selected={selection.design === item.id} onClick={() => setSelection((current) => ({ ...current, design: item.id }))} icon={item.icon} title={item.title} description={item.description} compact />)}</div></div><div className="selection-section"><div className="section-heading"><span className="section-index">04</span><div><h2>추가 기능 <small>선택 사항 · 최대 3개</small></h2><p>작동하는 요소를 더해 보세요.</p></div></div><div className="feature-grid">{features.map((item) => <button type="button" className={`feature-chip ${selection.features.includes(item.id) ? 'is-selected' : ''}`} aria-pressed={selection.features.includes(item.id)} onClick={() => toggleFeature(item.id)} key={item.id}><Icon name={item.icon} size={17} /><span>{item.title}</span>{selection.features.includes(item.id) ? <Icon name="check" size={15} /> : null}</button>)}</div></div></section><aside className="prompt-panel"><div className="prompt-panel-head"><div><p className="eyebrow">LIVE PROMPT</p><h2>조립된 요청</h2></div><span className={`prompt-ready ${page ? 'is-ready' : ''}`}><span />{page ? '준비됨' : '선택 필요'}</span></div><div className="prompt-preview">{page ? <pre>{prompt}</pre> : <div className="prompt-empty"><Icon name="wand" size={28} /><strong>페이지를 선택하면<br />프롬프트가 나타납니다.</strong><small>왼쪽 카드를 눌러 시작하세요.</small></div>}</div><div className="prompt-panel-foot"><button className="secondary-button full" type="button" onClick={onCopy} disabled={!page}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '복사 완료' : '프롬프트 복사'}</button><p><Icon name="lock" size={13} /> 외부 서버로 선택 정보를 보내지 않습니다.</p></div></aside></div><div className="sticky-actions"><button className="text-button" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>처음부터</button><button className="primary-button" type="button" disabled={!page} onClick={onNext}>Antigravity로 이동 <Icon name="arrow" size={17} /></button></div></main>; }

function AgentGuide({ prompt, copied, onCopy, onNext, onBack }: { prompt: string; copied: boolean; onCopy: () => void; onNext: () => void; onBack: () => void }) { return <main className="app-shell"><PageHeading eyebrow="BUILD / 02 — WORK WITH YOUR AGENT" title="이제 Antigravity에 요청을 전달하세요." description="현재 열려 있는 바탕화면\\AI실습 워크스페이스에서 실제 파일을 만들도록 요청합니다." /><div className="agent-layout"><section className="agent-steps"><div className="agent-step"><span>01</span><div><strong>프롬프트를 복사합니다.</strong><p>아래 요청 전체를 복사해 Antigravity 채팅창에 붙여 넣으세요.</p></div><Icon name="copy" size={20} /></div><div className="agent-step"><span>02</span><div><strong>파일 생성을 확인합니다.</strong><p>Antigravity가 `index.html`을 바탕화면\\AI실습 폴더에 직접 저장하게 합니다.</p></div><Icon name="checklist" size={20} /></div><div className="agent-step"><span>03</span><div><strong>브라우저에서 결과를 확인합니다.</strong><p>화면을 보고 글씨·색상·간격을 바꾸고 싶다면 다음 단계에서 수정 요청을 만듭니다.</p></div><Icon name="desktop" size={20} /></div><div className="agent-help"><Icon name="warning" size={19} /><div><strong>파일이 보이지 않나요?</strong><p>“현재 워크스페이스에 완성된 결과물을 index.html 파일로 직접 저장해줘.”라고 다시 입력하세요.</p></div></div></section><section className="agent-prompt-card"><div className="prompt-card-head"><span className="live-dot" /> ANTIGRAVITY REQUEST <button className="icon-button" type="button" onClick={onCopy} aria-label="프롬프트 복사"><Icon name={copied ? 'check' : 'copy'} size={18} /></button></div><pre>{prompt}</pre><button className="secondary-button full" type="button" onClick={onCopy}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '클립보드에 복사됨' : '프롬프트 복사'}</button></section></div><div className="page-actions"><button className="text-button" type="button" onClick={onBack}><Icon name="back" size={17} /> 선택 다시 하기</button><button className="primary-button" type="button" onClick={onNext}>파일 확인 후 다음 <Icon name="arrow" size={17} /></button></div></main>; }

function Revision({ selected, setSelected, directText, setDirectText, prompt, copied, onCopy, onNext, onBack }: { selected: string[]; setSelected: React.Dispatch<React.SetStateAction<string[]>>; directText: string; setDirectText: (value: string) => void; prompt: string; copied: boolean; onCopy: () => void; onNext: () => void; onBack: () => void }) { const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); return <main className="app-shell"><PageHeading eyebrow="BUILD / 03 — ITERATE ON THE RESULT" title="첫 결과를 보고, 한 번 더 다듬어 보세요." description="완벽한 첫 시도보다 확인하고 수정하는 과정이 중요합니다." /><div className="revision-layout"><section><div className="revision-intro"><span className="number-badge">1</span><div><h2>바꾸고 싶은 부분을 고르세요.</h2><p>여러 개를 함께 선택할 수 있습니다.</p></div></div><div className="revision-options">{revisionOptions.map((item) => <button type="button" className={`revision-option ${selected.includes(item.id) ? 'is-selected' : ''}`} aria-pressed={selected.includes(item.id)} onClick={() => toggle(item.id)} key={item.id}><span className="option-check">{selected.includes(item.id) ? <Icon name="check" size={14} /> : null}</span><span><strong>{item.title}</strong><small>{item.text}</small></span></button>)}</div><label className="direct-request"><span>직접 요청 <small>선택 사항</small></span><textarea value={directText} maxLength={500} onChange={(event) => setDirectText(event.target.value)} placeholder="예: 제목을 더 차분한 표현으로 바꿔줘" /><span className="char-count">{directText.length} / 500</span></label></section><section className="revision-preview"><div className="preview-label"><span className="number-badge">2</span><div><h2>수정 요청 미리보기</h2><p>Antigravity에 그대로 붙여 넣으세요.</p></div></div><div className="revision-prompt"><pre>{prompt}</pre></div><button className="secondary-button full" type="button" onClick={onCopy} disabled={!selected.length && !directText.trim()}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '복사 완료' : '수정 프롬프트 복사'}</button></section></div><div className="page-actions"><button className="text-button" type="button" onClick={onBack}><Icon name="back" size={17} /> 이전 단계</button><button className="primary-button" type="button" onClick={onNext}>완성된 파일 업로드 <Icon name="arrow" size={17} /></button></div></main>; }

function Upload({ file, validation, preview, uploading, error, onFile, onPublish, onBack }: { file: File | null; validation: Validation | null; preview: string; uploading: boolean; error: string; onFile: (file: File) => void; onPublish: () => void; onBack: () => void }) { const inputRef = useRef<HTMLInputElement>(null); const [dragging, setDragging] = useState(false); return <main className="app-shell upload-shell"><PageHeading eyebrow="PUBLISH / 01 — CHECK AND UPLOAD" title="완성된 index.html을 올려주세요." description="파일을 확인한 뒤 게시하면 충돌 없는 공개 URL과 QR이 발급됩니다." action={<span className="upload-limit"><Icon name="lock" size={14} /> 최대 1MB · HTML 1개</span>} /><div className="upload-layout"><section><button type="button" className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files[0]; if (dropped) onFile(dropped); }}><input ref={inputRef} type="file" accept=".html,text/html" hidden onChange={(event) => { const selected = event.target.files?.[0]; if (selected) onFile(selected); }} />{file ? <><span className="file-icon"><Icon name="check" size={24} /></span><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · 다시 선택하려면 클릭</small></> : <><span className="upload-icon"><Icon name="upload" size={25} /></span><strong>index.html 파일을 선택하세요.</strong><small>여기로 파일을 끌어 놓아도 됩니다.</small></>}</button>{validation?.issues.length ? <div className="validation-box error"><Icon name="warning" size={18} /><div><strong>업로드 전에 수정이 필요합니다.</strong>{validation.issues.map((issue) => <p key={issue}>{issue}</p>)}</div></div> : null}{validation?.warnings.length ? <div className="validation-box warning"><Icon name="warning" size={18} /><div><strong>확인해 주세요.</strong>{validation.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div> : null}{error ? <div className="validation-box error"><Icon name="warning" size={18} /><div><strong>게시 중 문제가 발생했습니다.</strong><p>{error}</p></div></div> : null}</section><section className="preview-card"><div className="preview-head"><div><p className="eyebrow">LIVE PREVIEW</p><h2>브라우저에서 확인</h2></div><div className="preview-modes"><span className="mode-active"><Icon name="desktop" size={14} /> 데스크톱</span><span><Icon name="mobile" size={14} /> 모바일</span></div></div><div className="preview-window"><div className="window-bar"><span /><span /><span /><small>{file ? 'index.html' : '미리보기 대기 중'}</small></div>{preview ? <iframe title="index.html 미리보기" className="preview-frame" sandbox="allow-scripts" srcDoc={preview} /> : <div className="preview-empty"><Icon name="desktop" size={28} /><span>파일을 선택하면<br />여기에 결과가 보입니다.</span></div>}</div></section></div><div className="page-actions"><button className="text-button" type="button" onClick={onBack}><Icon name="back" size={17} /> 수정 요청으로 돌아가기</button><button className="primary-button" type="button" disabled={!file || !!validation?.issues.length || uploading} onClick={onPublish}>{uploading ? <><span className="spinner" /> 게시 중…</> : <>게시하고 URL 받기 <Icon name="arrow" size={17} /></>}</button></div></main>; }

function Complete({ code, published, qrCode, onOpen, onCopy, copied, onRevise, onReset }: { code: string; published: Published; qrCode: string; onOpen: () => void; onCopy: () => void; copied: boolean; onRevise: () => void; onReset: () => void }) { return <main className="complete-shell"><div className="complete-top"><span className="complete-mark"><Icon name="check" size={21} /></span><p className="eyebrow">BUILD COMPLETE</p><h1>첫 웹페이지가<br /><em>공개되었습니다.</em></h1><p>에이전틱 코딩으로 만든 결과를 휴대폰에서도 확인해 보세요.</p></div><div className="result-card"><div className="result-info"><div className="result-code"><span>BUILDER CODE</span><strong>{code}</strong></div><div className="result-url"><span>PUBLIC RESULT URL</span><a href={published.url} target="_blank" rel="noreferrer">{published.url}<Icon name="external" size={15} /></a><small>이 URL은 {formatDate(published.expiresAt)}까지 열립니다.</small></div><div className="result-actions"><button className="primary-button" type="button" onClick={onOpen}>페이지 열기 <Icon name="external" size={16} /></button><button className="secondary-button" type="button" onClick={onCopy}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '복사 완료' : 'URL 복사'}</button></div></div><div className="qr-side"><div className="qr-frame">{qrCode ? <img src={qrCode} alt="공개 결과 URL QR 코드" /> : <div className="qr-placeholder"><span /><span /><span /><span /></div>}</div><p>휴대폰 카메라로<br />스캔해 보세요.</p></div></div><div className="complete-note"><Icon name="lock" size={15} /> 결과물은 별도 도메인의 안전한 미리보기에서 실행되며 7일 뒤 자동 삭제됩니다.</div><div className="complete-actions"><button className="text-button" type="button" onClick={onRevise}><Icon name="refresh" size={16} /> 다시 수정하기</button><button className="text-button" type="button" onClick={onReset}>처음부터 <Icon name="arrow" size={16} /></button></div></main>; }

export default function Home() {
  const [step, setStep] = useState<Step>('welcome');
  const [builderCode, setBuilderCode] = useState('BUILDER ----');
  const [latest, setLatest] = useState<Published | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [selection, setSelection] = useState<Selection>({ pageType: '', audience: '', design: '', features: [] });
  const [copied, setCopied] = useState(false);
  const [revisionCopied, setRevisionCopied] = useState(false);
  const [revisionSelected, setRevisionSelected] = useState<string[]>([]);
  const [directRevision, setDirectRevision] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState('');
  const [validation, setValidation] = useState<Validation | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [published, setPublished] = useState<Published | null>(null);
  const [qrCode, setQrCode] = useState('');
  useEffect(() => {
    const handle = window.setTimeout(() => {
      try {
        const savedCode = window.localStorage.getItem(BUILDER_KEY);
        const code = savedCode || makeBuilderCode();
        if (!savedCode) window.localStorage.setItem(BUILDER_KEY, code);
        setBuilderCode(code);
        const savedResult = window.localStorage.getItem(RESULT_KEY);
        if (savedResult) setLatest(JSON.parse(savedResult) as Published);
      } catch { /* browser storage may be disabled */ }
    }, 0);
    void fetch('/api/anonymous-session', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
    return () => window.clearTimeout(handle);
  }, []);
  useEffect(() => { if (!published?.url) return; QRCode.toDataURL(published.url, { width: 220, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14253d', light: '#ffffff' } }).then(setQrCode).catch(() => setQrCode('')); }, [published]);
  const page = pageTypes.find((item) => item.id === selection.pageType); const audience = audiences.find((item) => item.id === selection.audience); const design = designs.find((item) => item.id === selection.design); const selectedFeatureNames = features.filter((item) => selection.features.includes(item.id)).map((item) => item.title);
  const prompt = useMemo(() => { if (!page || !audience || !design) return ''; return `현재 열려 있는 바탕화면\\AI실습 워크스페이스에서 작업해줘.\n\n[목표]\n${page.goal}\n\n[대상]\n${audience.title}이 주로 사용한다.\n\n[필수 내용]\n${page.required.map((item) => `- ${item}`).join('\n')}\n\n[디자인]\n- ${design.title}\n- 핵심 내용이 첫 화면에서 보이게 한다.\n- 모바일 화면에서도 읽기 쉽고 터치하기 편하게 만든다.\n\n[기능]\n- ${selectedFeatureNames.length ? selectedFeatureNames.join('\n- ') : '페이지 유형에 맞는 인터랙션 1개 이상'}\n\n[작업 조건]\n1. 워크스페이스에 index.html 파일을 직접 생성한다.\n2. HTML, CSS, JavaScript를 모두 index.html 하나에 작성한다.\n3. 외부 CDN, 외부 폰트, 외부 이미지 URL, 서버 API, 로그인 기능을 사용하지 않는다.\n4. npm이나 별도 패키지를 설치하지 않는다.\n5. 현재 워크스페이스 외부의 파일을 수정하지 않는다.\n6. 완성 후 브라우저에서 직접 열어 기능과 화면을 확인한다.\n7. 오류가 있으면 수정한 후 작업 완료 여부를 알려준다.`; }, [audience, design, page, selectedFeatureNames]);
  useEffect(() => {
    if (step !== 'builder' || !prompt) return;
    const panelFoot = document.querySelector('.prompt-panel-foot');
    if (!panelFoot || panelFoot.querySelector('[data-direct-edit]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-button direct-edit-button';
    button.dataset.directEdit = 'true';
    button.textContent = '직접 수정';
    button.addEventListener('click', () => {
      const edited = window.prompt('Antigravity에 보낼 프롬프트를 직접 수정하세요.', prompt);
      if (edited?.trim() && edited !== prompt) {
        void copyToClipboard(edited).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }
    });
    panelFoot.appendChild(button);
    return () => button.remove();
  }, [prompt, step]);
  const revisionPrompt = useMemo(() => { const requests = revisionOptions.filter((item) => revisionSelected.includes(item.id)).map((item) => `- ${item.text}`); if (directRevision.trim()) requests.push(`- ${directRevision.trim()}`); return `현재 index.html의 내용과 기능은 유지하면서 다음 사항만 수정해줘.\n\n${requests.length ? requests.join('\n') : '- 화면을 다시 확인하고 가독성과 모바일 대응을 개선한다.'}\n\n수정 후 브라우저에서 다시 확인해줘.`; }, [directRevision, revisionSelected]);
  const reset = useCallback(() => { setStep('welcome'); setSlideIndex(0); setSelection({ pageType: '', audience: '', design: '', features: [] }); setRevisionSelected([]); setDirectRevision(''); setFile(null); setFileText(''); setValidation(null); setUploadError(''); setPublished(null); setQrCode(''); }, []);
  const copyPrompt = useCallback(() => { if (!prompt) return; copyToClipboard(prompt).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }); }, [prompt]);
  const copyRevision = useCallback(() => { copyToClipboard(revisionPrompt).then(() => { setRevisionCopied(true); window.setTimeout(() => setRevisionCopied(false), 1600); }); }, [revisionPrompt]);
  const handleFile = useCallback(async (selected: File) => { setUploadError(''); setFile(selected); try { const text = await selected.text(); setFileText(text); setValidation(validateHtml(text, selected.name, selected.size)); } catch { setFileText(''); setValidation({ issues: ['파일을 읽을 수 없습니다. 다른 파일을 선택해 주세요.'], warnings: [] }); } }, []);
  const publish = useCallback(async () => { if (!file || !fileText || validation?.issues.length) return; setUploading(true); setUploadError(''); try { const form = new FormData(); form.append('file', file, 'index.html'); const response = await fetch('/api/pages', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}` }, body: form }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.error?.message || '잠시 후 다시 시도해 주세요.'); const result = data as Published; setPublished(result); setLatest(result); setStep('complete'); try { window.localStorage.setItem(RESULT_KEY, JSON.stringify(result)); } catch { /* ignore */ } } catch (error) { setUploadError(error instanceof Error ? error.message : '게시 중 문제가 발생했습니다.'); } finally { setUploading(false); } }, [file, fileText, validation]);
  const openLatest = () => { if (latest?.url) window.open(latest.url, '_blank', 'noopener,noreferrer'); }; const openPublished = () => { if (published?.url) window.open(published.url, '_blank', 'noopener,noreferrer'); };
  if (step === 'welcome') return <Welcome builderCode={builderCode} latest={latest} onStart={() => setStep('learn')} onOpenLatest={openLatest} />;
  return <><TopBar step={step} onReset={reset} />{step === 'learn' ? <Learn index={slideIndex} setIndex={setSlideIndex} onNext={() => setStep('builder')} /> : null}{step === 'builder' ? <Builder selection={selection} setSelection={setSelection} prompt={prompt} copied={copied} onCopy={copyPrompt} onNext={() => setStep('agent')} /> : null}{step === 'agent' ? <AgentGuide prompt={prompt} copied={copied} onCopy={copyPrompt} onNext={() => setStep('revise')} onBack={() => setStep('builder')} /> : null}{step === 'revise' ? <Revision selected={revisionSelected} setSelected={setRevisionSelected} directText={directRevision} setDirectText={setDirectRevision} prompt={revisionPrompt} copied={revisionCopied} onCopy={copyRevision} onNext={() => setStep('upload')} onBack={() => setStep('agent')} /> : null}{step === 'upload' ? <Upload file={file} validation={validation} preview={fileText ? injectPreviewPolicy(fileText) : ''} uploading={uploading} error={uploadError} onFile={handleFile} onPublish={publish} onBack={() => setStep('revise')} /> : null}{step === 'complete' && published ? <Complete code={builderCode} published={published} qrCode={qrCode} onOpen={openPublished} onCopy={() => copyToClipboard(published.url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); })} copied={copied} onRevise={() => setStep('revise')} onReset={reset} /> : null}</>;
}
