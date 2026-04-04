import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.scss';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import App from './App.tsx';

document.title = 'CLI Proxy API Management Center';

// The usage-only subdomain should land on the public API key query page.
if (window.location.hostname === 'usage.claudepool.com') {
  const currentHash = window.location.hash || '';
  if (!currentHash || currentHash === '#' || currentHash === '#/' || currentHash === '#/index.html') {
    window.location.replace(`${window.location.pathname}#/api-key-query`);
  }
}

const faviconEl = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (faviconEl) {
  faviconEl.href = INLINE_LOGO_JPEG;
  faviconEl.type = 'image/jpeg';
} else {
  const newFavicon = document.createElement('link');
  newFavicon.rel = 'icon';
  newFavicon.type = 'image/jpeg';
  newFavicon.href = INLINE_LOGO_JPEG;
  document.head.appendChild(newFavicon);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
