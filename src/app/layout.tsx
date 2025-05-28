// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter, Montserrat } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '../contexts/ThemeContext';
import FacebookPixel from '../components/FacebookPixel';
import { Providers } from './providers'
import Script from 'next/script';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300'],
});

export const metadata: Metadata = {
  title: 'AwLov - AI-Powered Customer Experience',
  description: 'AwLov',
  icons: {
    icon: '/splash.png',
    shortcut: '/splash.png',
    apple: '/splash.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="theme-color" content="#111111" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" href="/splash.png" />
        <link rel="apple-touch-icon" href="/splash.png" />
        <Script src="https://js.stripe.com/v3/" strategy="beforeInteractive" />
        <link rel="preconnect dns-prefetch" href="https://api.config-security.com/" crossOrigin="" />
        <link rel="preconnect dns-prefetch" href="https://conf.config-security.com/" crossOrigin="" />
      </head>
      <body className={inter.className}>
        <Providers>
          <ThemeProvider>
            <FacebookPixel />
            {children}
            <Toaster position="top-right" richColors />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
