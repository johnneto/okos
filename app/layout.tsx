import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Okos - Ticket Orchestrator',
  description: 'Local AI-powered ticket management dashboard',
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
