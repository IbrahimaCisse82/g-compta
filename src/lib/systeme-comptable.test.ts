import { describe, it, expect } from 'vitest';
import { etatRefuse } from './systeme-comptable';

describe('CA-3.3 — dossier SMT', () => {
  it('refuse le bilan, le CR, le TFT, la liasse et les notes pour un dossier SMT', () => {
    for (const p of ['bilan', 'resultat', 'tft', 'liasse', 'note34']) expect(etatRefuse(p, 'smt')).toBe(true);
  });
  it('autorise ces états au système normal', () => {
    expect(etatRefuse('bilan', 'normal')).toBe(false);
    expect(etatRefuse('bilan', undefined)).toBe(false);
  });
  it('ne bloque pas la saisie pour un dossier SMT', () => {
    expect(etatRefuse('journal', 'smt')).toBe(false);
  });
});
