import { useCallback, useEffect, useRef, useState } from 'react';
import { StudySite } from './components/StudySite';
import { ChatistryApp } from './components/ChatistryApp';
import { supabase } from './supabase';

// ── Safety timer ──────────────────────────────────────────────────────────────
// The messaging layer closes itself after 2 minutes without interaction and
// returns to the study notes. This protects users whose devices are checked by
// others: the hidden layer is never left sitting open.
//
// The countdown is timestamp-based (not just setInterval-based), so it keeps
// running correctly while the tab is hidden, throttled, or the site is closed:
// on every return (focus/pageshow/visibility) and every 5s tick we compare the
// current time against the last-activity timestamp persisted in localStorage.
const IDLE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes
const ACTIVITY_KEY = 'ialnotes:lastActiveAt';
const LAYER_OPEN_KEY = 'ialnotes:workspaceOpen';
const ACTIVITY_PERSIST_THROTTLE_MS = 2000;

// Events that count as "the user is still there".
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'pointerdown', 'pointermove', 'mousemove', 'mousedown', 'touchstart',
  'keydown', 'input', 'wheel', 'scroll',
];

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const lastActivityRef = useRef(0);
  const lastPersistRef = useRef(0);

  const persistActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastPersistRef.current < ACTIVITY_PERSIST_THROTTLE_MS) return;
    lastPersistRef.current = now;
    try { localStorage.setItem(ACTIVITY_KEY, String(lastActivityRef.current)); } catch { /* storage unavailable */ }
  }, []);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    persistActivity();
  }, [persistActivity]);

  // `auto` = closed by the safety timer. In that case we also sign out, so a
  // reopened layer always asks for credentials again.
  const exitChat = useCallback((auto: boolean) => {
    if (!chatOpenRef.current) return;
    chatOpenRef.current = false;
    setChatOpen(false);
    try {
      sessionStorage.removeItem(LAYER_OPEN_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
    } catch { /* storage unavailable */ }
    document.body.style.overflow = '';
    if (auto) {
      supabase.auth.signOut().catch(err => console.warn('signOut on idle exit failed:', err));
    }
  }, []);

  const openChat = useCallback(() => {
    lastActivityRef.current = Date.now();
    lastPersistRef.current = 0;
    chatOpenRef.current = true;
    setChatOpen(true);
    try {
      sessionStorage.setItem(LAYER_OPEN_KEY, '1');
      localStorage.setItem(ACTIVITY_KEY, String(lastActivityRef.current));
    } catch { /* storage unavailable */ }
  }, []);

  // Restore the layer after a reload/refresh, but only if the user was active
  // within the last 2 minutes — a stale session never comes back on its own.
  useEffect(() => {
    let restored = false;
    try {
      const wasOpen = sessionStorage.getItem(LAYER_OPEN_KEY) === '1';
      const last = Number(localStorage.getItem(ACTIVITY_KEY) ?? 0);
      if (wasOpen && last > 0 && Date.now() - last < IDLE_LIMIT_MS) {
        lastActivityRef.current = last;
        chatOpenRef.current = true;
        setChatOpen(true);
        restored = true;
      }
    } catch { /* storage unavailable */ }
    if (!restored) {
      try {
        sessionStorage.removeItem(LAYER_OPEN_KEY);
        localStorage.removeItem(ACTIVITY_KEY);
      } catch { /* storage unavailable */ }
    }
  }, []);

  // Activity tracking + expiry checks while the layer is open.
  useEffect(() => {
    if (!chatOpen) return;

    const checkIdle = () => {
      if (!chatOpenRef.current) return;
      if (Date.now() - lastActivityRef.current >= IDLE_LIMIT_MS) exitChat(true);
    };

    const onActivity = () => markActivity();

    // On hide: persist the timestamp so the countdown is intact across a close
    // or crash. On show: enforce the limit immediately (interval timers are
    // throttled or frozen in hidden tabs).
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        try { localStorage.setItem(ACTIVITY_KEY, String(lastActivityRef.current)); } catch { /* ignore */ }
      } else {
        checkIdle();
      }
    };

    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, onActivity, { passive: true }));
    window.addEventListener('focus', checkIdle);
    window.addEventListener('pageshow', checkIdle);
    window.addEventListener('pagehide', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);

    const interval = setInterval(checkIdle, 5000);
    document.body.style.overflow = 'hidden';
    checkIdle(); // catch up immediately (e.g. restored just before expiry)

    return () => {
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, onActivity));
      window.removeEventListener('focus', checkIdle);
      window.removeEventListener('pageshow', checkIdle);
      window.removeEventListener('pagehide', onVisibility);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
      document.body.style.overflow = '';
    };
  }, [chatOpen, markActivity, exitChat]);

  return (
    <StudySite
      chatOpen={chatOpen}
      onOpenChat={openChat}
      onExitChat={() => exitChat(false)}
    >
      <ChatistryApp onExit={() => exitChat(false)} />
    </StudySite>
  );
}
