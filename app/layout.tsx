import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Agentic Coding Lab',
  description: '코드를 몰라도 AI 에이전트와 함께 첫 웹페이지를 만드는 실습 공간입니다.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
