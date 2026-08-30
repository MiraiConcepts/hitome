import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

import { AccentColor, Colors } from '@/constants/theme';

/**
 * Root HTML wrapper for every web route (static export). Runs in Node only —
 * no DOM/browser APIs here. Global CSS and providers belong in _layout.tsx.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* Favicon + PWA */}
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="theme-color" content={AccentColor} />

        {/*
          Disable body scrolling on web so ScrollView components work as
          expected. Remove if you want native web scroll behaviour.
        */}
        <ScrollViewStyleReset />

        {/* Web runs the dark palette only (see hooks/use-color-scheme.web.ts).
            Declaring it here paints the page — and the browser's own form
            controls and scrollbars — dark from the first frame, instead of a
            white flash before React mounts. */}
        <style dangerouslySetInnerHTML={{ __html: darkGround }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const darkGround = `
:root { color-scheme: dark; }
html, body, #root { background-color: ${Colors.dark.background}; }
`;
