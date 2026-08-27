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
type LearningVisual = { layout: 'flow' | 'grid' | 'cards'; iconsOnly?: boolean; items: Array<{ label: string; note?: string; icon: IconName }> };
type LearningSlide = { kicker: string; title: string; body: string; stat: string; visual: LearningVisual };
type ContextOption = { id: string; title: string; description: string; icon: IconName };
type FeatureOption = { id: string; title: string; description: string; icon: IconName };
type FeatureGroup = { id: string; title: string; description: string; mode: 'single' | 'multiple'; max?: number; options: FeatureOption[] };

const MAX_BYTES = 1024 * 1024;
const BUILDER_KEY = 'ai-lab-builder-code-v1';
const RESULT_KEY = 'ai-lab-latest-result-v1';
const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const pageTypes = [
  { id: 'schedule', title: '업무 체크리스트·일정 관리', description: '할 일과 캘린더 일정을 한 화면에서 관리하는 웹', icon: 'calendar' as IconName, goal: '업무 체크리스트와 캘린더를 한 화면에서 관리하는 일정 관리 웹페이지를 만든다.', required: ['샘플 일정 6개 이상', '오늘 할 일 체크리스트', '주간 또는 월간 캘린더', '일정 추가와 완료 처리', '전체 진행률'], contextTitle: '누가 일정을 관리할까요?', contextDescription: '사용 장면에 맞춰 일정과 업무 구성을 바꿉니다.', defaultAudience: 'schedule-personal', defaultDesign: 'work', defaultFeatures: ['schedule-week', 'schedule-check', 'schedule-progress'] },
  { id: 'wage', title: '아르바이트 시급 계산기', description: '근무 시간과 시급을 입력해 예상 급여를 계산하는 웹', icon: 'dashboard' as IconName, goal: '아르바이트생이 근무 시간과 시급을 입력해 예상 급여를 확인하는 계산기 웹페이지를 만든다.', required: ['시급과 근무 시작·종료 시간 입력', '휴게시간 입력', '총 근무시간 표시', '기본급과 추가수당 계산', '예시 입력값과 초기화 버튼'], contextTitle: '어떤 상황에서 계산할까요?', contextDescription: '사용 상황에 맞춰 입력값과 계산 결과를 구성합니다.', defaultAudience: 'wage-worker', defaultDesign: 'friendly', defaultFeatures: ['wage-daily', 'wage-break', 'wage-night'] },
  { id: 'inventory', title: '재고 품목 확인 대시보드', description: '테스트 데이터로 수량과 부족 품목을 확인하는 웹', icon: 'dashboard' as IconName, goal: '테스트 데이터가 미리 채워진 재고 품목 확인 대시보드를 만든다.', required: ['샘플 품목 10개 이상', '품목명·카테고리·현재수량·안전재고·상태', '전체·정상·부족 품목 요약 카드', '부족 재고 강조 표시', '검색과 필터', '재고 현황 간단 차트'], contextTitle: '누가 재고를 확인할까요?', contextDescription: '업무 역할에 맞춰 지표와 우선순위를 바꿉니다.', defaultAudience: 'inventory-store', defaultDesign: 'cards', defaultFeatures: ['inventory-table', 'inventory-search', 'inventory-low'] },
] as const;
const contextOptionsByPage: Record<string, ContextOption[]> = {
  schedule: [
    { id: 'schedule-personal', title: '개인 업무', description: '내 할 일과 회의 일정을 함께 관리', icon: 'user' },
    { id: 'schedule-team', title: '팀 프로젝트', description: '담당자와 마감일을 함께 확인', icon: 'users' },
    { id: 'schedule-store', title: '매장 근무', description: '교대 일정과 매장 업무를 함께 관리', icon: 'calendar' },
  ],
  wage: [
    { id: 'wage-worker', title: '아르바이트생', description: '내 근무 시간과 예상 급여 확인', icon: 'user' },
    { id: 'wage-manager', title: '점주·관리자', description: '근무 기록을 바탕으로 급여 확인', icon: 'users' },
    { id: 'wage-multiple', title: '여러 근무지', description: '근무지별 시급과 시간을 따로 계산', icon: 'link' },
  ],
  inventory: [
    { id: 'inventory-store', title: '매장 직원', description: '판매 현장에서 빠르게 재고 확인', icon: 'user' },
    { id: 'inventory-warehouse', title: '창고 관리자', description: '입출고와 부족 품목을 한눈에 확인', icon: 'checklist' },
    { id: 'inventory-buyer', title: '구매 담당자', description: '재주문이 필요한 품목부터 확인', icon: 'users' },
  ],
};
const designs = [
  { id: 'work', title: '깔끔한 업무형', description: '정보를 빠르게 찾는 절제된 레이아웃', icon: 'checklist' as IconName },
  { id: 'friendly', title: '밝고 친근한 스타일', description: '처음 보는 사람도 편안한 화면', icon: 'spark' as IconName },
  { id: 'tech', title: '어두운 테크 스타일', description: '집중도 높은 다크톤 인터페이스', icon: 'wand' as IconName },
  { id: 'cards', title: '카드 중심 대시보드', description: '숫자와 상태를 카드로 정리', icon: 'dashboard' as IconName },
  { id: 'guide', title: '큰 글씨의 안내형', description: '모바일에서도 읽기 쉬운 구성', icon: 'mobile' as IconName },
] as const;
const featureGroupsByPage: Record<string, FeatureGroup[]> = {
  schedule: [
    { id: 'schedule-view', title: '캘린더 보기', description: '하나만 선택', mode: 'single', options: [
      { id: 'schedule-week', title: '주간 캘린더', description: '이번 주 일정 중심', icon: 'calendar' },
      { id: 'schedule-month', title: '월간 캘린더', description: '한 달 일정을 한눈에', icon: 'calendar' },
      { id: 'schedule-agenda', title: '목록형 일정', description: '가까운 일정부터 표시', icon: 'checklist' },
    ] },
    { id: 'schedule-actions', title: '업무 기능', description: '여러 개 선택 · 최대 3개', mode: 'multiple', max: 3, options: [
      { id: 'schedule-check', title: '완료 체크', description: '업무를 바로 완료 처리', icon: 'check' },
      { id: 'schedule-progress', title: '진행률', description: '완료 비율 자동 계산', icon: 'dashboard' },
      { id: 'schedule-add', title: '일정 추가', description: '새 일정 입력 기능', icon: 'calendar' },
      { id: 'schedule-filter', title: '상태 필터', description: '예정·진행·완료로 보기', icon: 'link' },
    ] },
  ],
  wage: [
    { id: 'wage-period', title: '급여 기준', description: '하나만 선택', mode: 'single', options: [
      { id: 'wage-daily', title: '하루 급여', description: '하루 근무 기준 계산', icon: 'dashboard' },
      { id: 'wage-weekly', title: '주간 급여', description: '일주일 근무를 합산', icon: 'calendar' },
      { id: 'wage-monthly', title: '월 예상 급여', description: '한 달 예상 금액 표시', icon: 'calendar' },
    ] },
    { id: 'wage-options', title: '계산 항목', description: '여러 개 선택 · 최대 3개', mode: 'multiple', max: 3, options: [
      { id: 'wage-break', title: '휴게시간 제외', description: '쉬는 시간을 자동 차감', icon: 'refresh' },
      { id: 'wage-night', title: '야간수당', description: '야간 근무 수당 계산', icon: 'wand' },
      { id: 'wage-weekly-holiday', title: '주휴수당', description: '조건에 따라 수당 표시', icon: 'checklist' },
      { id: 'wage-history', title: '근무 기록 추가', description: '여러 근무일을 합산', icon: 'calendar' },
      { id: 'wage-print', title: '결과 인쇄', description: '계산 결과를 출력', icon: 'desktop' },
    ] },
  ],
  inventory: [
    { id: 'inventory-view', title: '기본 보기', description: '하나만 선택', mode: 'single', options: [
      { id: 'inventory-table', title: '표 중심', description: '품목을 행으로 비교', icon: 'checklist' },
      { id: 'inventory-cards', title: '카드 중심', description: '품목 상태를 카드로 확인', icon: 'dashboard' },
      { id: 'inventory-chart', title: '차트 중심', description: '재고 수량을 시각화', icon: 'dashboard' },
    ] },
    { id: 'inventory-tools', title: '확인 도구', description: '여러 개 선택 · 최대 3개', mode: 'multiple', max: 3, options: [
      { id: 'inventory-search', title: '품목 검색', description: '이름으로 빠르게 찾기', icon: 'link' },
      { id: 'inventory-category', title: '카테고리 필터', description: '분류별 품목 보기', icon: 'chevron' },
      { id: 'inventory-low', title: '부족 재고 강조', description: '안전재고 미만을 표시', icon: 'warning' },
      { id: 'inventory-sort', title: '수량 정렬', description: '많거나 적은 순서로 보기', icon: 'refresh' },
      { id: 'inventory-restock', title: '재입고 버튼', description: '재입고 상태를 바로 반영', icon: 'check' },
    ] },
  ],
};
const slides: LearningSlide[] = [
  {
    kicker: '01 / 시작',
    title: 'AI로 직접 나만의 페이지를 만들어 보자!',
    body: '아이디어를 고르고 AI에게 요청하면, 바로 열어 볼 수 있는 페이지가 완성됩니다.',
    stat: '아이디어에서 웹페이지까지',
    visual: { layout: 'flow', items: [{ label: '아이디어', icon: 'spark' }, { label: 'AI 요청', icon: 'wand' }, { label: '내 페이지', icon: 'desktop' }] },
  },
  {
    kicker: '02 / 에이전트',
    title: 'AI가 파일을 만들고 화면까지 확인해요.',
    body: 'Antigravity가 요청을 읽고 index.html을 만든 뒤 브라우저에서 결과를 확인합니다.',
    stat: '요청부터 확인까지 한 번에',
    visual: { layout: 'flow', items: [{ label: '요청', icon: 'copy' }, { label: 'index.html', icon: 'checklist' }, { label: '화면 확인', icon: 'desktop' }] },
  },
  {
    kicker: '03 / 함께 만들기',
    title: '나는 방향을 정하고, AI는 손을 움직여요.',
    body: '대상과 내용, 분위기를 고르면 AI가 실제 페이지로 옮깁니다.',
    stat: '함께 만드는 새로운 방식',
    visual: { layout: 'cards', items: [{ label: '내가 정해요', note: '목표 · 대상 · 분위기', icon: 'user' }, { label: 'AI가 만들어요', note: '파일 · 기능 · 화면', icon: 'wand' }] },
  },
  {
    kicker: '04 / 요청 만들기',
    title: '원하는 모습을 알려주세요',
    body: '페이지 종류, 볼 사람, 꼭 넣을 내용, 원하는 분위기를 고르면 됩니다.',
    stat: '선택할수록 요청이 또렷해져요',
    visual: { layout: 'grid', items: [{ label: '종류', icon: 'dashboard' }, { label: '대상', icon: 'users' }, { label: '내용', icon: 'checklist' }, { label: '분위기', icon: 'palette' }] },
  },
  {
    kicker: '05 / 페이지 고르기',
    title: '만들 페이지를 고르세요',
    body: '일정 관리, 시급 계산, 재고 확인 중 오늘 필요한 하나를 선택합니다.',
    stat: '실제로 쓰는 페이지를 만들어요',
    visual: { layout: 'cards', iconsOnly: true, items: [{ label: '일정 관리', icon: 'calendar' }, { label: '시급 계산', icon: 'dashboard' }, { label: '재고 확인', icon: 'checklist' }] },
  },
  {
    kicker: '06 / 다듬기',
    title: '마음에 들게 다듬어요',
    body: '글씨, 색상, 간격을 살펴보고 원하는 부분을 한 번 더 요청합니다.',
    stat: '확인하고 고치면 더 좋아져요',
    visual: { layout: 'flow', items: [{ label: '선택', icon: 'palette' }, { label: '생성', icon: 'wand' }, { label: '수정', icon: 'refresh' }, { label: '게시', icon: 'upload' }] },
  },
  {
    kicker: '07 / 실습 시작',
    title: '자! 시작해볼까요?',
    body: '몇 가지를 골라서 AI 에이전트에게 요청해 봅시다',
    stat: '준비되면 바로 시작해요!',
    visual: { layout: 'flow', items: [{ label: '선택하기', icon: 'check' }, { label: '요청문 받기', icon: 'copy' }, { label: '만들기', icon: 'spark' }] },
  },
];
const revisionGroups = [
  { id: 'content', title: '글과 정보', options: [
    { id: 'larger', title: '글씨를 더 크게', text: '전체 글씨를 조금 더 크게 해 줘.' },
    { id: 'short-title', title: '제목을 짧게', text: '긴 제목을 짧고 또렷하게 바꿔 줘.' },
    { id: 'shorter', title: '내용을 간결하게', text: '겹치는 문장을 줄이고 핵심만 남겨 줘.' },
    { id: 'emphasis', title: '핵심을 더 강조', text: '중요한 숫자와 안내가 먼저 보이게 해 줘.' },
  ] },
  { id: 'color', title: '색상과 분위기', options: [
    { id: 'brighter', title: '색상을 더 밝게', text: '배경과 주요 색상을 밝고 편안하게 바꿔 줘.' },
    { id: 'contrast', title: '대비를 더 선명하게', text: '글자와 배경의 대비를 높여 내용을 또렷하게 보여 줘.' },
    { id: 'calmer', title: '색감을 더 차분하게', text: '색상 수를 줄이고 차분한 색조로 정리해 줘.' },
    { id: 'dark', title: '다크 모드 추가', text: '밝은 화면과 어두운 화면을 전환할 수 있게 해 줘.' },
  ] },
  { id: 'layout', title: '배치와 카드', options: [
    { id: 'spacing', title: '카드 간격을 넓게', text: '카드 사이 간격을 넉넉하게 조정해 줘.' },
    { id: 'sections', title: '섹션을 또렷하게', text: '제목과 여백을 활용해 각 영역을 분명하게 나눠 줘.' },
    { id: 'alignment', title: '정렬을 깔끔하게', text: '카드와 글자의 시작선을 맞춰 화면을 정돈해 줘.' },
    { id: 'first-view', title: '첫 화면을 정리', text: '첫 화면에 핵심 내용과 주요 기능이 보이게 정리해 줘.' },
  ] },
  { id: 'usability', title: '버튼과 사용성', options: [
    { id: 'button', title: '버튼을 더 눈에 띄게', text: '주요 버튼이 첫 화면에서 잘 보이게 해 줘.' },
    { id: 'mobile', title: '모바일 화면 개선', text: '작은 화면에서도 읽고 누르기 편하게 바꿔 줘.' },
    { id: 'motion', title: '움직임을 부드럽게', text: '버튼과 카드의 상태 변화를 자연스러운 애니메이션으로 보여 줘.' },
    { id: 'print', title: '인쇄 화면 추가', text: '핵심 내용만 깔끔하게 출력되는 인쇄 화면을 만들어 줘.' },
  ] },
] as const;
const revisionOptions = revisionGroups.flatMap((group) => group.options);

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
  if (fileSize === 0 || !text.trim()) issues.push('내용이 있는 HTML 파일을 선택해 주세요.');
  if (fileSize > MAX_BYTES) issues.push('파일 크기는 1MB 이하여야 합니다.');
  if (!/<html[\s>]/i.test(text) || !/<body[\s>]/i.test(text)) issues.push('`<html>`과 `<body>`가 들어간 파일을 선택해 주세요.');
  if (!/<meta[^>]+charset=/i.test(text)) warnings.push('한글 표시를 위해 charset 메타 태그를 추가해 주세요.');
  if (!/<meta[^>]+name=["']viewport["']/i.test(text)) warnings.push('모바일 대응을 위해 viewport 메타 태그를 권장합니다.');
  const resourcePatterns = [
    { pattern: /<script\b[^>]+src\s*=\s*["'](?!data:|blob:)[^"']+/i, message: 'JavaScript 코드를 index.html 안에 넣어 주세요.' },
    { pattern: /<link\b[^>]+href\s*=\s*["'](?!data:|blob:)[^"']+/i, message: '스타일과 폰트도 index.html 안에 넣어 주세요.' },
    { pattern: /<(?:img|audio|video|source)\b[^>]+src\s*=\s*["'](?:https?:|\/\/)/i, message: '이미지와 미디어는 data URL로 넣어 주세요.' },
    { pattern: /@import\s+[^;]*(?:https?:|\/\/)/i, message: 'CSS는 `<style>` 태그 안에 넣어 주세요.' },
    { pattern: /url\(\s*["']?(?:https?:|\/\/)/i, message: 'CSS 리소스도 index.html 안에 넣어 주세요.' },
    { pattern: /<(?:iframe|object|embed|form|base)\b/i, message: '폼과 프레임, 객체 삽입을 빼고 구성해 주세요.' },
    { pattern: /<meta\b[^>]+http-equiv\s*=\s*["']refresh/i, message: '자동 이동 코드를 빼 주세요.' },
    { pattern: /(?:href|src)\s*=\s*["']\s*javascript:/i, message: '링크에는 일반 주소를 넣어 주세요.' },
    { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*[(.]/i, message: '네트워크 요청을 빼고 한 파일 안에서 완성해 주세요.' },
  ];
  for (const item of resourcePatterns) if (item.pattern.test(text)) issues.push(item.message);
  if (/<a\b[^>]+href\s*=\s*["'](?:https?:|\/\/)/i.test(text)) warnings.push('외부 링크는 격리된 결과 화면에서 열립니다.');
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
  return <header className="topbar"><button className="brand" type="button" onClick={onReset} aria-label="처음 화면으로"><span className="brand-mark"><Icon name="spark" size={18} /></span><span><strong>AI AGENTIC</strong><small>CODING LAB</small></span></button><div className="top-progress" aria-label="실습 진행 상태">{steps.map((item, index) => <div className={`top-step ${index <= active && active >= 0 ? 'is-active' : ''} ${item.key === step ? 'is-current' : ''}`} key={item.key}><span>{String(index + 1).padStart(2, '0')}</span>{item.label}</div>)}</div></header>;
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) { return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description ? <p className="lead">{description}</p> : null}</div>{action}</div>; }
function SelectionCard({ selected, onClick, icon, title, description, compact = false }: { selected: boolean; onClick: () => void; icon: IconName; title: string; description: string; compact?: boolean }) { return <button type="button" className={`selection-card ${compact ? 'is-compact' : ''} ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={onClick}><span className="card-icon"><Icon name={icon} /></span><span className="card-copy"><strong>{title}</strong><small>{description}</small></span><span className="card-check">{selected ? <Icon name="check" size={16} /> : null}</span></button>; }

function LearningDiagram({ visual, title }: { visual: LearningVisual; title: string }) {
  return <div className={`learning-diagram is-${visual.layout} ${visual.iconsOnly ? 'is-icons-only' : ''}`} role="img" aria-label={`${title} 핵심 흐름`}>
    {!visual.iconsOnly ? <span className="diagram-label">한눈에 보기</span> : null}
    <div className="diagram-items">
      {visual.items.map((item) => <div className="diagram-item" key={item.label}>
        <span className="diagram-icon"><Icon name={item.icon} size={23} /></span>
        {!visual.iconsOnly ? <strong>{item.label}</strong> : null}
        {!visual.iconsOnly && item.note ? <small>{item.note}</small> : null}
      </div>)}
    </div>
  </div>;
}

function Welcome({ builderCode, latest, onStart, onOpenLatest }: { builderCode: string; latest: Published | null; onStart: () => void; onOpenLatest: () => void }) {
  return <main className="welcome-shell">
    <div className="clay-orb clay-orb-one" aria-hidden="true" />
    <div className="clay-orb clay-orb-two" aria-hidden="true" />
    <div className="welcome-grid">
      <section className="welcome-copy">
        <p className="eyebrow">FIRST AGENTIC BUILD / 40 MIN LAB</p>
        <h1><em>AI와 만드는</em><br />첫 웹페이지.</h1>
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
    <div className="welcome-footer"><span className="welcome-code-chip"><span>실습 코드</span><strong>{builderCode.replace('BUILDER ', '')}</strong></span><span>AX 테크선도팀</span></div>
  </main>;
}

function Learn({ index, setIndex, onNext }: { index: number; setIndex: (value: number) => void; onNext: () => void }) {
  const slide = slides[index];
  return <main className="app-shell learning-shell">
    <div className="learning-header">
      <p className="eyebrow">ORIENTATION / {slide.kicker}</p>
      <div className="slide-count"><strong>{String(index + 1).padStart(2, '0')}</strong><span>/ 07</span></div>
    </div>
    <section className="learning-stage">
      <div className="learning-card">
        <div className="learning-number">{String(index + 1).padStart(2, '0')}</div>
        <div className="learning-content">
          <p className="eyebrow">{slide.kicker}</p>
          <h1>{slide.title}</h1>
          <p>{slide.body}</p>
          <div className="learning-stat"><span className="stat-line" />{slide.stat}</div>
        </div>
        <LearningDiagram visual={slide.visual} title={slide.title} />
      </div>
      <div className="slide-dots" role="tablist" aria-label="개념 슬라이드">{slides.map((item, itemIndex) => <button type="button" role="tab" aria-selected={itemIndex === index} aria-label={`${itemIndex + 1}번째 슬라이드`} className={itemIndex === index ? 'is-active' : ''} onClick={() => setIndex(itemIndex)} key={item.kicker} />)}</div>
    </section>
    <div className="page-actions"><button className="text-button" type="button" onClick={() => index > 0 && setIndex(index - 1)} disabled={index === 0}><Icon name="back" size={17} /> 이전</button>{index < slides.length - 1 ? <button className="primary-button" type="button" onClick={() => setIndex(index + 1)}>다음 <Icon name="arrow" size={17} /></button> : <button className="primary-button" type="button" onClick={onNext}>페이지 만들기 <Icon name="arrow" size={17} /></button>}</div>
  </main>;
}

function Builder({ selection, setSelection, prompt, copied, onCopy, onNext }: { selection: Selection; setSelection: React.Dispatch<React.SetStateAction<Selection>>; prompt: string; copied: boolean; onCopy: () => void; onNext: () => void }) {
  const page = pageTypes.find((item) => item.id === selection.pageType);
  const contextOptions = page ? contextOptionsByPage[page.id] ?? [] : [];
  const featureGroups = page ? featureGroupsByPage[page.id] ?? [] : [];
  const toggleFeature = (group: FeatureGroup, id: string) => setSelection((current) => {
    const groupIds = group.options.map((item) => item.id);
    if (group.mode === 'single') {
      if (current.features.includes(id)) return current;
      return { ...current, features: [...current.features.filter((item) => !groupIds.includes(item)), id] };
    }
    if (current.features.includes(id)) return { ...current, features: current.features.filter((item) => item !== id) };
    const selectedInGroup = current.features.filter((item) => groupIds.includes(item)).length;
    if (selectedInGroup >= (group.max ?? group.options.length)) return current;
    return { ...current, features: [...current.features, id] };
  });
  return <main className="app-shell builder-shell">
    <PageHeading eyebrow="BUILD / 01 — CHOOSE YOUR DIRECTION" title="무엇을 만들어 볼까요?" />
    <div className="builder-layout">
      <section className="builder-selections">
        <div className="selection-section"><div className="section-heading"><span className="section-index">01</span><div><h2>만들 페이지</h2><p>하나를 골라 주세요.</p></div></div><div className="card-grid page-grid">{pageTypes.map((item) => <SelectionCard key={item.id} selected={selection.pageType === item.id} onClick={() => setSelection({ pageType: item.id, audience: item.defaultAudience, design: item.defaultDesign, features: [...item.defaultFeatures] })} icon={item.icon} title={item.title} description={item.description} />)}</div></div>
        <div className="selection-section dynamic-context"><div className="section-heading"><span className="section-index">02</span><div><h2>{page?.contextTitle ?? '사용 상황'}</h2><p>{page?.contextDescription ?? '먼저 만들 페이지를 골라 주세요.'}</p></div></div>{page ? <div className="card-grid compact-grid" key={page.id}>{contextOptions.map((item) => <SelectionCard key={item.id} selected={selection.audience === item.id} onClick={() => setSelection((current) => ({ ...current, audience: item.id }))} icon={item.icon} title={item.title} description={item.description} compact />)}</div> : <div className="context-empty"><Icon name="arrow" size={18} /><span>01에서 주제를 고르면 맞춤 선택지가 열려요.</span></div>}</div>
        <div className="selection-section"><div className="section-heading"><span className="section-index">03</span><div><h2>어떤 느낌이 좋을까요?</h2><p>마음에 드는 화면 분위기를 골라 주세요.</p></div></div><div className="card-grid compact-grid">{designs.map((item) => <SelectionCard key={item.id} selected={selection.design === item.id} onClick={() => setSelection((current) => ({ ...current, design: item.id }))} icon={item.icon} title={item.title} description={item.description} compact />)}</div></div>
        <div className="selection-section"><div className="section-heading"><span className="section-index">04</span><div><h2>기능 구성</h2><p>선택 방식이 다른 기능을 구역별로 나눴어요.</p></div></div>{page ? <div className="feature-sectors">{featureGroups.map((group) => <div className={`feature-sector is-${group.mode}`} key={group.id}><div className="feature-sector-head"><strong>{group.title}</strong><span>{group.description}</span></div><div className="feature-grid" role={group.mode === 'single' ? 'radiogroup' : 'group'} aria-label={group.title}>{group.options.map((item) => { const selected = selection.features.includes(item.id); return <button type="button" role={group.mode === 'single' ? 'radio' : undefined} aria-checked={group.mode === 'single' ? selected : undefined} aria-pressed={group.mode === 'multiple' ? selected : undefined} className={`feature-chip ${selected ? 'is-selected' : ''}`} onClick={() => toggleFeature(group, item.id)} key={item.id}><Icon name={item.icon} size={17} /><span><strong>{item.title}</strong><small>{item.description}</small></span>{selected ? <Icon name="check" size={15} /> : null}</button>; })}</div></div>)}</div> : <div className="context-empty"><Icon name="arrow" size={18} /><span>주제를 고르면 필요한 기능이 나타나요.</span></div>}</div>
      </section>
      <aside className="prompt-panel"><div className="prompt-panel-head"><div><p className="eyebrow">LIVE PROMPT</p><h2>완성된 요청문</h2></div><span className={`prompt-ready ${page ? 'is-ready' : ''}`}><span />{page ? '준비 완료' : '페이지 선택'}</span></div><div className="prompt-preview">{page ? <pre>{prompt}</pre> : <div className="prompt-empty"><Icon name="wand" size={28} /><strong>페이지를 고르면<br />요청문이 완성돼요.</strong><small>왼쪽 카드에서 시작해 주세요.</small></div>}</div><div className="prompt-panel-foot"><button className="secondary-button full" type="button" onClick={onCopy} disabled={!page}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '복사 완료' : '요청문 복사'}</button><p><Icon name="lock" size={13} /> 선택 내용은 이 브라우저에서만 다룹니다.</p></div></aside>
    </div>
    <div className="sticky-actions"><button className="text-button" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>맨 위로</button><button className="primary-button" type="button" disabled={!page} onClick={onNext}>요청문 확인하기 <Icon name="arrow" size={17} /></button></div>
  </main>;
}

function AgentGuide({ prompt, copied, onCopy, onNext, onBack }: { prompt: string; copied: boolean; onCopy: () => void; onNext: () => void; onBack: () => void }) {
  return <main className="app-shell">
    <PageHeading eyebrow="BUILD / 02 — WORK WITH YOUR AGENT" title="요청문을 Antigravity에 붙여 넣어 주세요." description="AI실습 워크스페이스에서 index.html을 만들 차례입니다." />
    <div className="agent-layout">
      <section className="agent-steps">
        <div className="agent-step"><span>01</span><div><strong>요청문을 복사해요.</strong><p>오른쪽 요청문을 복사해 Antigravity 채팅창에 붙여 넣습니다.</p></div><Icon name="copy" size={20} /></div>
        <div className="agent-step"><span>02</span><div><strong>index.html을 확인해요.</strong><p>파일은 바탕화면\\AI실습 폴더에 저장됩니다.</p></div><Icon name="checklist" size={20} /></div>
        <div className="agent-step"><span>03</span><div><strong>완성된 화면을 열어 봐요.</strong><p>글씨, 색상, 간격을 살펴보고 다음 단계에서 원하는 부분을 다듬습니다.</p></div><Icon name="desktop" size={20} /></div>
        <div className="agent-help"><Icon name="wand" size={19} /><div><strong>파일 저장 한 번 더 요청하기</strong><p>“완성된 결과를 현재 워크스페이스의 index.html로 저장해 줘.”라고 입력하세요.</p></div></div>
      </section>
      <section className="agent-prompt-card"><div className="prompt-card-head"><span className="live-dot" /> ANTIGRAVITY REQUEST <button className="icon-button" type="button" onClick={onCopy} aria-label="요청문 복사"><Icon name={copied ? 'check' : 'copy'} size={18} /></button></div><pre>{prompt}</pre><button className="secondary-button full" type="button" onClick={onCopy}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '복사 완료' : '요청문 복사'}</button></section>
    </div>
    <div className="page-actions"><button className="text-button" type="button" onClick={onBack}><Icon name="back" size={17} /> 선택으로 돌아가기</button><button className="primary-button" type="button" onClick={onNext}>화면 다듬기 <Icon name="arrow" size={17} /></button></div>
  </main>;
}

function Revision({ selected, setSelected, directText, setDirectText, prompt, copied, onCopy, onNext, onBack }: { selected: string[]; setSelected: React.Dispatch<React.SetStateAction<string[]>>; directText: string; setDirectText: (value: string) => void; prompt: string; copied: boolean; onCopy: () => void; onNext: () => void; onBack: () => void }) {
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <main className="app-shell">
    <PageHeading eyebrow="BUILD / 03 — ITERATE ON THE RESULT" title="완성된 화면을 내 취향에 맞게 다듬어 봐요." />
    <div className="revision-layout">
      <section><div className="revision-intro"><span className="number-badge">1</span><div><h2>바꾸고 싶은 부분</h2><p>16개 중 여러 개를 함께 고를 수 있어요.</p></div></div><div className="revision-scroll-meta"><span>{selected.length}개 선택</span><span>스크롤해서 더 보기 <Icon name="chevron" size={13} /></span></div><div className="revision-choice-scroll" tabIndex={0} aria-label="화면 다듬기 선택지 16개">{revisionGroups.map((group) => <section className="revision-group" aria-labelledby={`revision-group-${group.id}`} key={group.id}><h3 id={`revision-group-${group.id}`}>{group.title}</h3><div className="revision-options">{group.options.map((item) => <button type="button" className={`revision-option ${selected.includes(item.id) ? 'is-selected' : ''}`} aria-pressed={selected.includes(item.id)} onClick={() => toggle(item.id)} key={item.id}><span className="option-check">{selected.includes(item.id) ? <Icon name="check" size={14} /> : null}</span><span><strong>{item.title}</strong><small>{item.text}</small></span></button>)}</div></section>)}</div><label className="direct-request"><span>직접 적기 <small>선택</small></span><textarea value={directText} maxLength={500} onChange={(event) => setDirectText(event.target.value)} placeholder="예: 제목을 조금 더 차분하게 바꿔 줘" /><span className="char-count">{directText.length} / 500</span></label></section>
      <section className="revision-preview"><div className="preview-label"><span className="number-badge">2</span><div><h2>다듬기 요청문</h2><p>복사해서 Antigravity에 붙여 넣어 주세요.</p></div></div><div className="revision-prompt"><pre>{prompt}</pre></div><button className="secondary-button full" type="button" onClick={onCopy} disabled={!selected.length && !directText.trim()}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '복사 완료' : '다듬기 요청문 복사'}</button></section>
    </div>
    <div className="page-actions"><button className="text-button" type="button" onClick={onBack}><Icon name="back" size={17} /> 이전</button><button className="primary-button" type="button" onClick={onNext}>파일 올리기 <Icon name="arrow" size={17} /></button></div>
  </main>;
}

function Upload({ file, validation, preview, uploading, error, onFile, onPublish, onBack }: { file: File | null; validation: Validation | null; preview: string; uploading: boolean; error: string; onFile: (file: File) => void; onPublish: () => void; onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <main className="app-shell upload-shell">
    <PageHeading eyebrow="PUBLISH / 01 — CHECK AND UPLOAD" title="완성한 index.html을 올려 주세요." description="미리보기를 확인하고 게시하면 URL과 QR이 만들어집니다." action={<span className="upload-limit"><Icon name="lock" size={14} /> 최대 1MB · HTML 1개</span>} />
    <div className="upload-layout">
      <section><button type="button" className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files[0]; if (dropped) onFile(dropped); }}><input ref={inputRef} type="file" accept=".html,text/html" hidden onChange={(event) => { const selected = event.target.files?.[0]; if (selected) onFile(selected); }} />{file ? <><span className="file-icon"><Icon name="check" size={24} /></span><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · 바꾸려면 다시 눌러 주세요</small></> : <><span className="upload-icon"><Icon name="upload" size={25} /></span><strong>index.html을 골라 주세요.</strong><small>파일을 이곳으로 끌어와도 돼요.</small></>}</button>{validation?.issues.length ? <div className="validation-box error"><Icon name="warning" size={18} /><div><strong>파일을 조금 다듬어 주세요.</strong>{validation.issues.map((issue) => <p key={issue}>{issue}</p>)}</div></div> : null}{validation?.warnings.length ? <div className="validation-box warning"><Icon name="warning" size={18} /><div><strong>한 번 확인해 주세요.</strong>{validation.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div> : null}{error ? <div className="validation-box error"><Icon name="warning" size={18} /><div><strong>게시를 이어서 진행해 주세요.</strong><p>{error}</p></div></div> : null}</section>
      <section className="preview-card"><div className="preview-head"><div><p className="eyebrow">LIVE PREVIEW</p><h2>완성 화면</h2></div><div className="preview-modes"><span className="mode-active"><Icon name="desktop" size={14} /> 데스크톱</span><span><Icon name="mobile" size={14} /> 모바일</span></div></div><div className="preview-window"><div className="window-bar"><span /><span /><span /><small>{file ? 'index.html' : '파일을 기다리는 중'}</small></div>{preview ? <iframe title="index.html 미리보기" className="preview-frame" sandbox="allow-scripts" srcDoc={preview} /> : <div className="preview-empty"><Icon name="desktop" size={28} /><span>파일을 고르면<br />완성 화면이 보여요.</span></div>}</div></section>
    </div>
    <div className="page-actions"><button className="text-button" type="button" onClick={onBack}><Icon name="back" size={17} /> 다듬기로 돌아가기</button><button className="primary-button" type="button" disabled={!file || !!validation?.issues.length || uploading} onClick={onPublish}>{uploading ? <><span className="spinner" /> 게시 중…</> : <>게시하고 URL 받기 <Icon name="arrow" size={17} /></>}</button></div>
  </main>;
}

function Complete({ code, published, qrCode, onOpen, onCopy, copied, onRevise, onReset }: { code: string; published: Published; qrCode: string; onOpen: () => void; onCopy: () => void; copied: boolean; onRevise: () => void; onReset: () => void }) {
  return <main className="complete-shell"><div className="complete-top"><span className="complete-mark"><Icon name="check" size={21} /></span><p className="eyebrow">BUILD COMPLETE</p><h1>내 첫 웹페이지가<br /><em>완성됐어요!</em></h1><p>URL이나 QR로 바로 열어 볼 수 있어요.</p></div><div className="result-card"><div className="result-info"><div className="result-code"><span>BUILDER CODE</span><strong>{code}</strong></div><div className="result-url"><span>PUBLIC RESULT URL</span><a href={published.url} target="_blank" rel="noreferrer">{published.url}<Icon name="external" size={15} /></a><small>{formatDate(published.expiresAt)}까지 열 수 있어요.</small></div><div className="result-actions"><button className="primary-button" type="button" onClick={onOpen}>페이지 열기 <Icon name="external" size={16} /></button><button className="secondary-button" type="button" onClick={onCopy}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? '복사 완료' : 'URL 복사'}</button></div></div><div className="qr-side"><div className="qr-frame">{qrCode ? <img src={qrCode} alt="공개 결과 URL QR 코드" /> : <div className="qr-placeholder"><span /><span /><span /><span /></div>}</div><p>휴대폰 카메라로<br />QR을 비춰 보세요.</p></div></div><div className="complete-note"><Icon name="lock" size={15} /> 결과 페이지는 격리된 화면에서 열리고, 게시 후 7일 동안 유지됩니다.</div><div className="complete-actions"><button className="text-button" type="button" onClick={onRevise}><Icon name="refresh" size={16} /> 더 다듬기</button><button className="text-button" type="button" onClick={onReset}>새로 만들기 <Icon name="arrow" size={16} /></button></div></main>;
}

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
  const page = pageTypes.find((item) => item.id === selection.pageType);
  const contextOptions = page ? contextOptionsByPage[page.id] ?? [] : [];
  const audience = contextOptions.find((item) => item.id === selection.audience);
  const design = designs.find((item) => item.id === selection.design);
  const currentFeatureGroups = page ? featureGroupsByPage[page.id] ?? [] : [];
  const selectedFeatureNames = currentFeatureGroups.flatMap((group) => group.options).filter((item) => selection.features.includes(item.id)).map((item) => item.title);
  const selectedFeatureText = selectedFeatureNames.join('\n- ');
  const prompt = useMemo(() => { if (!page || !audience || !design) return ''; return `현재 열려 있는 바탕화면\\AI실습 워크스페이스에서 작업해줘.\n\n[목표]\n${page.goal}\n\n[사용 상황]\n${audience.title}: ${audience.description}\n\n[필수 내용]\n${page.required.map((item) => `- ${item}`).join('\n')}\n\n[디자인]\n- ${design.title}\n- 핵심 내용이 첫 화면에서 보이게 한다.\n- 모바일에서도 읽고 누르기 편하게 구성한다.\n\n[기능]\n- ${selectedFeatureText || '페이지 유형에 맞는 인터랙션 1개 이상'}\n\n[작업 방법]\n1. 워크스페이스에 index.html을 만든다.\n2. HTML, CSS, JavaScript를 index.html 하나에 작성한다.\n3. 필요한 코드와 리소스를 모두 index.html 안에 넣는다.\n4. 브라우저 기본 기능만 활용해 완성한다.\n5. 현재 워크스페이스의 index.html만 작성한다.\n6. 브라우저에서 화면과 기능을 확인한다.\n7. 발견한 오류를 고친 뒤 완료 내용을 알려준다.`; }, [audience, design, page, selectedFeatureText]);
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
  const revisionPrompt = useMemo(() => { const requests = revisionOptions.filter((item) => revisionSelected.includes(item.id)).map((item) => `- ${item.text}`); if (directRevision.trim()) requests.push(`- ${directRevision.trim()}`); return `현재 index.html을 바탕으로 아래 부분을 다듬어 줘.\n\n${requests.length ? requests.join('\n') : '- 읽기 편한 화면과 모바일 구성을 한 번 더 살펴봐 줘.'}\n\n다듬은 뒤 브라우저에서 다시 확인해 줘.`; }, [directRevision, revisionSelected]);
  const reset = useCallback(() => { setStep('welcome'); setSlideIndex(0); setSelection({ pageType: '', audience: '', design: '', features: [] }); setRevisionSelected([]); setDirectRevision(''); setFile(null); setFileText(''); setValidation(null); setUploadError(''); setPublished(null); setQrCode(''); }, []);
  const copyPrompt = useCallback(() => { if (!prompt) return; copyToClipboard(prompt).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); }); }, [prompt]);
  const copyRevision = useCallback(() => { copyToClipboard(revisionPrompt).then(() => { setRevisionCopied(true); window.setTimeout(() => setRevisionCopied(false), 1600); }); }, [revisionPrompt]);
  const handleFile = useCallback(async (selected: File) => { setUploadError(''); setFile(selected); try { const text = await selected.text(); setFileText(text); setValidation(validateHtml(text, selected.name, selected.size)); } catch { setFileText(''); setValidation({ issues: ['파일을 여는 데 시간이 걸렸어요. 다른 파일을 골라 주세요.'], warnings: [] }); } }, []);
  const publish = useCallback(async () => { if (!file || !fileText || validation?.issues.length) return; setUploading(true); setUploadError(''); try { const form = new FormData(); form.append('file', file, 'index.html'); const response = await fetch('/api/pages', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}` }, body: form }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.error?.message || '잠시 뒤 게시 버튼을 한 번 더 눌러 주세요.'); const result = data as Published; setPublished(result); setLatest(result); setStep('complete'); try { window.localStorage.setItem(RESULT_KEY, JSON.stringify(result)); } catch { /* ignore */ } } catch (error) { setUploadError(error instanceof Error ? error.message : '게시가 잠시 멈췄어요. 버튼을 한 번 더 눌러 주세요.'); } finally { setUploading(false); } }, [file, fileText, validation]);
  const openLatest = () => { if (latest?.url) window.open(latest.url, '_blank', 'noopener,noreferrer'); }; const openPublished = () => { if (published?.url) window.open(published.url, '_blank', 'noopener,noreferrer'); };
  if (step === 'welcome') return <Welcome builderCode={builderCode} latest={latest} onStart={() => setStep('learn')} onOpenLatest={openLatest} />;
  return <><TopBar step={step} onReset={reset} />{step === 'learn' ? <Learn index={slideIndex} setIndex={setSlideIndex} onNext={() => setStep('builder')} /> : null}{step === 'builder' ? <Builder selection={selection} setSelection={setSelection} prompt={prompt} copied={copied} onCopy={copyPrompt} onNext={() => setStep('agent')} /> : null}{step === 'agent' ? <AgentGuide prompt={prompt} copied={copied} onCopy={copyPrompt} onNext={() => setStep('revise')} onBack={() => setStep('builder')} /> : null}{step === 'revise' ? <Revision selected={revisionSelected} setSelected={setRevisionSelected} directText={directRevision} setDirectText={setDirectRevision} prompt={revisionPrompt} copied={revisionCopied} onCopy={copyRevision} onNext={() => setStep('upload')} onBack={() => setStep('agent')} /> : null}{step === 'upload' ? <Upload file={file} validation={validation} preview={fileText ? injectPreviewPolicy(fileText) : ''} uploading={uploading} error={uploadError} onFile={handleFile} onPublish={publish} onBack={() => setStep('revise')} /> : null}{step === 'complete' && published ? <Complete code={builderCode} published={published} qrCode={qrCode} onOpen={openPublished} onCopy={() => copyToClipboard(published.url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); })} copied={copied} onRevise={() => setStep('revise')} onReset={reset} /> : null}</>;
}
