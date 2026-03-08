import { useEffect } from 'react';
import type { PageId } from '@/stores/app-store';

interface ShortcutOptions {
  setPage: (page: PageId) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
}

const PAGE_SHORTCUTS: Record<string, PageId> = {
  'd': 'dashboard',
  's': 'saisie',
  'j': 'journal',
  'b': 'balance',
  'g': 'grandlivre',
  'i': 'bilan',
  'r': 'resultat',
  'p': 'plan',
  'e': 'exercices',
};

export function useKeyboardShortcuts({ setPage, toggleTheme, toggleSidebar }: ShortcutOptions) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;

      // Alt+key for page navigation
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const page = PAGE_SHORTCUTS[e.key.toLowerCase()];
        if (page) {
          e.preventDefault();
          setPage(page);
          return;
        }
      }

      // Alt+T = toggle theme
      if (e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // Alt+M = toggle sidebar (mobile)
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Alt+? = show shortcuts help
      if (e.altKey && (e.key === '?' || e.key === '/')) {
        e.preventDefault();
        // dispatch custom event for help modal
        window.dispatchEvent(new CustomEvent('show-shortcuts'));
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setPage, toggleTheme, toggleSidebar]);
}
