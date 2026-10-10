import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WIR · Das Mitarbeiterportal',
  description: 'Das Mitarbeiterportal von Schloss & Gut Liebenberg und der DKB STIFTUNG',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'WIR' },
};

export const viewport: Viewport = { themeColor: '#6B7A3E', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a className="skip" href="#inhalt">Zum Inhalt springen</a>
        {children}
      </body>
    </html>
  );
}
