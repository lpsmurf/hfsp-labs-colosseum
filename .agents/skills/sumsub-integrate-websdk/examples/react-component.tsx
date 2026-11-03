// React wrapper around the Sumsub WebSDK builder.
//
// Assumes:
//   - <script src="https://static.sumsub.com/idensic/static/sns-websdk-builder.js"></script>
//     is loaded once in index.html / _document.tsx. (For dynamic loading, see
//     loadSumsubScript() below.)
//   - A backend route at /api/sumsub/access-token mints tokens for the
//     authenticated user. See SKILL.md "Stage 2".
//
// Sandbox tokens only during integration work.

import { useEffect, useRef } from 'react';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { snsWebSdk: any }
}

type Props = {
  levelName: string;
  email?: string;
  phone?: string;
  lang?: string;
  theme?: 'light' | 'dark';
  onReady?: () => void;
  onSubmitted?: () => void;
  onFinalClientSide?: (payload: unknown) => void;
  onError?: (err: unknown) => void;
};

async function fetchAccessToken(): Promise<string> {
  const r = await fetch('/api/sumsub/access-token', { method: 'POST' });
  if (!r.ok) throw new Error(`access-token endpoint returned ${r.status}`);
  const { token } = (await r.json()) as { token: string };
  return token;
}

// Optional: load the CDN script on-demand if it isn't in the document yet.
function loadSumsubScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.snsWebSdk) return Promise.resolve();
  const src = 'https://static.sumsub.com/idensic/static/sns-websdk-builder.js';
  const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
  if (existing) {
    // If the script already completed loading earlier, resolve immediately.
    if ((existing as any).dataset?.loaded === 'true' || existing.readyState === 'complete' || existing.readyState === 'loaded') {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('failed to load sumsub script')));
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => {
      try { s.dataset.loaded = 'true'; } catch (e) {}
      resolve();
    };
    s.onerror = () => reject(new Error('failed to load sumsub script'));
    document.head.appendChild(s);
  });
}

export function SumsubWebSdk({
  levelName,
  email,
  phone,
  lang = 'en',
  theme = 'light',
  onReady,
  onSubmitted,
  onFinalClientSide,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const onSubmittedRef = useRef(onSubmitted);
  const onFinalClientSideRef = useRef(onFinalClientSide);
  const onErrorRef = useRef(onError);

  // keep refs up-to-date without forcing effect re-run
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onSubmittedRef.current = onSubmitted; }, [onSubmitted]);
  useEffect(() => { onFinalClientSideRef.current = onFinalClientSide; }, [onFinalClientSide]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sdk: any = null;

    (async () => {
      try {
        await loadSumsubScript();
        if (cancelled) return;

        const initialToken = await fetchAccessToken();
        if (cancelled) return;

        sdk = window.snsWebSdk
          .init(initialToken, () => fetchAccessToken())
          .withConf({ lang, theme, email, phone })
          .withOptions({ addViewportTag: false, adaptIframeHeight: true })
          .on('idCheck.onReady', () => onReadyRef.current?.())
          .on('idCheck.onApplicantSubmitted', () => onSubmittedRef.current?.())
          .on('idCheck.onApplicantReviewed', (p: unknown) => onFinalClientSideRef.current?.(p))
          .on('idCheck.onApplicantVerificationCompleted', (p: unknown) => onFinalClientSideRef.current?.(p))
          .on('idCheck.onError', (e: unknown) => onErrorRef.current?.(e))
          .build();

        if (!cancelled && containerRef.current) {
          sdk.launch(containerRef.current);
        }
      } catch (err) {
        if (!cancelled) onErrorRef.current?.(err);
      }
    })();

    return () => {
      cancelled = true;
      // The builder does not expose a public destroy() at time of writing.
      // Clearing the container removes the iframe, which is enough for SPA
      // navigation. React 18 strict-mode double-mount is handled by this.
      if (containerRef.current) containerRef.current.innerHTML = '';
      sdk = null;
    };
  }, [levelName, email, phone, lang, theme]);

  return <div ref={containerRef} id="sumsub-websdk-container" style={{ minHeight: 600 }} />;
}
