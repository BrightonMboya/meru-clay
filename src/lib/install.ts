/**
 * Installing the club office as an app.
 *
 * Chrome and Edge (Android and desktop) offer installation through a
 * `beforeinstallprompt` event, fired once per page load, often before any
 * screen has mounted. So it is caught here, at import — RegisterSW imports
 * this from the office layout — and held until somebody presses Install.
 *
 * Safari has no such event: on an iPhone the only way is Share → Add to Home
 * Screen, so the screen shows those steps instead. Same for any browser that
 * never fires the event.
 *
 * Client-only. Nothing here runs on the server.
 */

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: PromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep the browser's own mini-infobar out of the way; the office asks.
    e.preventDefault();
    deferred = e as PromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export type InstallState =
  /** Already running as the installed app. */
  | 'installed'
  /** The browser will install on a button press. */
  | 'prompt'
  /** iPhone or iPad: Share → Add to Home Screen. */
  | 'ios'
  /** Anything else: the browser menu's "Install app" / "Add to Home screen". */
  | 'manual';

export function installState(): InstallState {
  if (installed || isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios';
  return 'manual';
}

/** Show the browser's install dialog. True if they accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === 'accepted';
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, from before display-mode was supported there.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; a Mac with a touchscreen is an iPad.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
