/** Instalação como app (PWA): atalho na tela inicial, abre sem barra do navegador. */
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  // Chrome/Android/Edge avisam quando o app pode ser instalado
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = undefined;
    emit();
  });
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function useInstall() {
  const canPrompt = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => !!deferred,
  );
  return {
    installed: isStandalone(),
    ios: isIOS(),
    canPrompt,
    async prompt() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = undefined;
      emit();
      return outcome === 'accepted';
    },
  };
}
