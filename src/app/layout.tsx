import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reserve a cabana | 1942 On The Square',
  description:
    'Reserve one of three cabanas at 1942 On The Square, 3B Keys Ferry St, McDonough, GA.',
};

export const viewport = { themeColor: '#3854a5', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
