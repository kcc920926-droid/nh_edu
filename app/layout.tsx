import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = 'https://etlabs.tplinkdns.com/lab';

export const metadata: Metadata = {
  title: 'AI Agentic Coding Lab',
  description: 'AI와 함께 나만의 첫 웹페이지를 만드는 실습 공간입니다.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'AI Agentic Coding Lab',
    description: 'AI와 만드는 첫 웹페이지 — 요청문 만들기부터 QR 공유까지 40분 실습.',
    url: SITE_URL,
    siteName: 'AI Agentic Coding Lab',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630 }],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
