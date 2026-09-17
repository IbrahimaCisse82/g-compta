import { describe, it, expect } from 'vitest';
import { lancerControles, toutesAnomalies, compterParSeverite, CONTROLES } from './coherence-controls';
import type { BalanceLine, JournalLine, PlanCompte, Exercice } from './accounting';

const bl = (compte: string, p: Partial<BalanceLine> = {}): BalanceLine => ({
  compte, intitule: '', sd: 0, sc: 0, md: 0, mc: 0, sfd: 0, sfc: 0, ...p,
});

const jl = (id: string, piece: string, compte: string, debit: number, credit: number, date = '2024-03-15'): JournalLine => ({
  id, exercice_id: 'ex1', entreprise_id: 'ent1',
  date_ecriture: date, piece, journal_code: 'AC', libelle: 'Test',
  compte, intitule: '', debit, credit,
});

const plan: PlanCompte[] = [
  { id: '1', entreprise_id: 'ent1', numero: '101', intitule: 'Capital', classe: '1', sens: 'C', type_compte: 'passif', actif: true },
  { id: '2', entreprise_id: 'ent1', numero: '521', intitule: 'Banque', classe: '5', sens: 'D', type_compte: 'actif', actif: true },
  { id: '3', entreprise_id: 'ent1', numero: '701', intitule: 'Ventes', classe: '7', sens: 'C', type_compte: 'gestion', actif: true },
  { id: '4', entreprise_id: 'ent1', numero: '601', intitule: 'Achats', classe: '6', sens: 'D', type_compte: 'gestion', actif: true },
  { id: '5', entreprise_id: 'ent1', numero: '411', intitule: 'Clients', classe: '4', sens: 'D', type_compte: 'tiers', actif: true },
  { id: '6', entreprise_id: 'ent1', numero: '401', intitule: 'Fournisseurs', classe: '4', sens: 'C', type_compte: 'tiers', actif: true },
  { id: '7', entreprise_id: 'ent1', numero: '311', intitule: 'Stocks', classe: '3', sens: 'D', type_compte: 'actif', actif: true },
];

const exercice: Exercice = {
  id: 'ex1', entreprise_id: 'ent1', annee: 2024,
  date_debut: '2024-01-01', date_fin: '2024-12-31', statut: 'en_cours',
};

function ctx(balance: BalanceLine[], journal: JournalLine[] = [], exc = exercice) {
  return { balance, journal, plan, exercice: exc };
}

describe('coherence-controls — structure', () => {
  it('définit exactement 22 contrôles', () => {
    expect(CONTROLES).toHaveLength(22);
  });

  it('chaque contrôle a un identifiant unique', () => {
    const ids = CONTROLES.map(c => c.id);
    expect(new Set(ids).size).toBe(22);
  });

  it('chaque contrôle a une sévérité valide', () => {
    for (const c of CONTROLES) {
      expect(['bloquant', 'majeur', 'mineur']).toContain(c.severite);
    }
  });
});

describe('C01 — Équilibre général débit / crédit', () => {
  it('passe si débit = crédit', () => {
    const balance = [bl('521', { md: 1000 }), bl('701', { mc: 1000 })];
    const res = lancerControles(ctx(balance));
    expect(res[0].statut).toBe('ok');
  });

  it('détecte un déséquilibre', () => {
    const balance = [bl('521', { md: 1000 }), bl('701', { mc: 900 })];
    const res = lancerControles(ctx(balance));
    expect(res[0].statut).toBe('anomalie');
    expect(res[0].anomalies[0].severite).toBe('bloquant');
  });
});

describe('C02 — Équilibre du bilan', () => {
  it('passe si actif = passif', () => {
    const balance = [bl('521', { sfd: 1000 }), bl('101', { sfc: 1000 })];
    const res = lancerControles(ctx(balance));
    expect(res[1].statut).toBe('ok');
  });

  it('détecte un déséquilibre actif ≠ passif', () => {
    const balance = [bl('521', { sfd: 1000 }), bl('101', { sfc: 800 })];
    const res = lancerControles(ctx(balance));
    expect(res[1].statut).toBe('anomalie');
  });
});

describe('C03 — Écritures déséquilibrées', () => {
  it('passe si toutes les écritures sont équilibrées', () => {
    const journal = [jl('1', 'P001', '521', 500, 0), jl('2', 'P001', '701', 0, 500)];
    const res = lancerControles(ctx([], journal));
    expect(res[2].statut).toBe('ok');
  });

  it('détecte une écriture déséquilibrée', () => {
    const journal = [jl('1', 'P001', '521', 500, 0), jl('2', 'P001', '701', 0, 400)];
    const res = lancerControles(ctx([], journal));
    expect(res[2].statut).toBe('anomalie');
    expect(res[2].anomalies[0].piece).toBe('P001');
  });
});

describe('C04 — Écritures sans pièce', () => {
  it('détecte les écritures sans numéro de pièce', () => {
    const journal = [jl('1', '', '521', 500, 0)];
    const res = lancerControles(ctx([], journal));
    expect(res[3].statut).toBe('anomalie');
  });

  it('passe si toutes les écritures ont une pièce', () => {
    const journal = [jl('1', 'P001', '521', 500, 0), jl('2', 'P001', '701', 0, 500)];
    const res = lancerControles(ctx([], journal));
    expect(res[3].statut).toBe('ok');
  });
});

describe('C05 — Écritures mono-ligne', () => {
  it('détecte une écriture avec une seule ligne', () => {
    const journal = [jl('1', 'P001', '521', 500, 0)];
    const res = lancerControles(ctx([], journal));
    expect(res[4].statut).toBe('anomalie');
  });
});

describe('C06 — Dates hors exercice', () => {
  it('détecte une écriture datée avant le début de l\'exercice', () => {
    const journal = [jl('1', 'P001', '521', 500, 0), jl('2', 'P001', '701', 0, 500, '2023-12-31')];
    const res = lancerControles(ctx([], journal));
    expect(res[5].statut).toBe('anomalie');
  });

  it('passe si toutes les dates sont dans l\'exercice', () => {
    const journal = [jl('1', 'P001', '521', 500, 0), jl('2', 'P001', '701', 0, 500, '2024-06-15')];
    const res = lancerControles(ctx([], journal));
    expect(res[5].statut).toBe('ok');
  });
});

describe('C07 — Comptes hors plan', () => {
  it('détecte un compte utilisé mais absent du plan', () => {
    const journal = [jl('1', 'P001', '999', 500, 0), jl('2', 'P001', '701', 0, 500)];
    const res = lancerControles(ctx([], journal));
    expect(res[6].statut).toBe('anomalie');
    expect(res[6].anomalies[0].compte).toBe('999');
  });
});

describe('C08 — Comptes de gestion avec solde d\'ouverture', () => {
  it('détecte un compte 7 avec solde d\'ouverture', () => {
    const balance = [bl('701', { sc: 500 })];
    const res = lancerControles(ctx(balance));
    expect(res[7].statut).toBe('anomalie');
  });

  it('passe si pas de solde d\'ouverture sur les comptes 6/7/8', () => {
    const balance = [bl('701', { mc: 5000 })];
    const res = lancerControles(ctx(balance));
    expect(res[7].statut).toBe('ok');
  });
});

describe('C09 — Compte d\'actif au solde créditeur', () => {
  it('détecte un compte de stock au solde créditeur', () => {
    const balance = [bl('311', { sfc: 200 })];
    const res = lancerControles(ctx(balance));
    expect(res[8].statut).toBe('anomalie');
  });
});

describe('C11 — Client au solde créditeur', () => {
  it('détecte un compte 411 au solde créditeur', () => {
    const balance = [bl('411000', { sfc: 300, intitule: 'Client X' })];
    const res = lancerControles(ctx(balance));
    expect(res[10].statut).toBe('anomalie');
  });
});

describe('C12 — Fournisseur au solde débiteur', () => {
  it('détecte un compte 401 au solde débiteur', () => {
    const balance = [bl('401000', { sfd: 200, intitule: 'Fournisseur Y' })];
    const res = lancerControles(ctx(balance));
    expect(res[11].statut).toBe('anomalie');
  });
});

describe('C13 — Trésorerie au solde créditeur', () => {
  it('détecte un compte 521 au solde créditeur', () => {
    const balance = [bl('521000', { sfc: 500, intitule: 'Banque' })];
    const res = lancerControles(ctx(balance));
    expect(res[12].statut).toBe('anomalie');
  });
});

describe('C14 — Stock au solde créditeur', () => {
  it('détecte un compte de stock au solde créditeur', () => {
    const balance = [bl('311000', { sfc: 100, intitule: 'Stock marchandises' })];
    const res = lancerControles(ctx(balance));
    expect(res[13].statut).toBe('anomalie');
    expect(res[13].anomalies[0].severite).toBe('bloquant');
  });
});

describe('C15 — Capital social nul', () => {
  it('détecte un capital nul', () => {
    const balance = [bl('101000', { sfc: 0, intitule: 'Capital' })];
    const res = lancerControles(ctx(balance));
    expect(res[14].statut).toBe('anomalie');
  });

  it('passe si le capital est positif', () => {
    const balance = [bl('101000', { sfc: 1000000, intitule: 'Capital' })];
    const res = lancerControles(ctx(balance));
    expect(res[14].statut).toBe('ok');
  });
});

describe('C16 — Résultat non affecté', () => {
  it('détecte un solde 131 sur exercice en cours', () => {
    const balance = [bl('131000', { sfc: 50000, intitule: 'Résultat' })];
    const res = lancerControles(ctx(balance));
    expect(res[15].statut).toBe('anomalie');
  });

  it('ne signale pas si l\'exercice est clôturé', () => {
    const balance = [bl('131000', { sfc: 50000, intitule: 'Résultat' })];
    const excCloture = { ...exercice, statut: 'cloture' as const };
    const res = lancerControles(ctx(balance, [], excCloture));
    expect(res[15].statut).toBe('ok');
  });
});

describe('C22 — Numérotation séquentielle', () => {
  it('détecte un saut de numérotation', () => {
    const journal = [
      jl('1', '001', '521', 500, 0), jl('2', '001', '701', 0, 500),
      jl('3', '003', '521', 300, 0), jl('4', '003', '701', 0, 300),
    ];
    const res = lancerControles(ctx([], journal));
    expect(res[21].statut).toBe('anomalie');
  });

  it('passe si la numérotation est continue', () => {
    const journal = [
      jl('1', '001', '521', 500, 0), jl('2', '001', '701', 0, 500),
      jl('3', '002', '521', 300, 0), jl('4', '002', '701', 0, 300),
    ];
    const res = lancerControles(ctx([], journal));
    expect(res[21].statut).toBe('ok');
  });
});

describe('compterParSeverite', () => {
  it('compte les anomalies par sévérité', () => {
    const balance = [
      bl('311', { sfc: 100 }),  // C09 + C14
      bl('411', { sfc: 200 }),  // C11
    ];
    const res = lancerControles(ctx(balance));
    const counts = compterParSeverite(res);
    expect(counts.bloquant).toBeGreaterThan(0);
    expect(counts.mineur).toBeGreaterThan(0);
  });
});

describe('toutesAnomalies', () => {
  it('retourne toutes les anomalies aplaties', () => {
    const balance = [bl('311', { sfc: 100 })];
    const res = lancerControles(ctx(balance));
    const all = toutesAnomalies(res);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every(a => a.controle_id)).toBe(true);
  });
});

describe('scénario complet — balance saine', () => {
  it('ne détecte aucune anomalie sur une balance équilibrée et conforme', () => {
    const balance = [
      bl('101', { sfc: 1000000, intitule: 'Capital' }),
      bl('521', { sfd: 600000, intitule: 'Banque' }),
      bl('311', { sfd: 400000, intitule: 'Stocks' }),
    ];
    const journal = [
      jl('1', '001', '521', 100000, 0), jl('2', '001', '701', 0, 100000),
    ];
    const res = lancerControles(ctx(balance, journal));
    const all = toutesAnomalies(res);
    // C01 passe (100000 = 100000), C02 passe (1M = 1M), etc.
    // Quelques contrôles mineurs peuvent signaler des choses (C17 TVA, C18 HAO) mais il n'y en a pas ici
    expect(all.length).toBe(0);
  });
});
