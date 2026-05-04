// SYSCOHADA — Spécification officielle des mappings comptes/notes annexes (22-40)
// Permet de valider la conformité du mapping et de détecter comptes manquants/inattendus.

export interface NoteSpec {
  num: string;
  label: string;
  // Préfixes de comptes attendus (regex sur le numéro de compte)
  expectedPrefixes: RegExp;
  // Description lisible des plages
  expectedRanges: string[];
  // Type : balance / résultat / informative (sans mapping comptable)
  type: 'bilan' | 'resultat' | 'informative';
}

export const NOTES_SPEC: NoteSpec[] = [
  // Compte de résultat (Lot 5)
  { num: '22',  label: 'Achats consommés',                 type: 'resultat', expectedPrefixes: /^60/,                       expectedRanges: ['60 — Achats et variations de stocks'] },
  { num: '23',  label: 'Transports',                       type: 'resultat', expectedPrefixes: /^61/,                       expectedRanges: ['61 — Transports'] },
  { num: '24',  label: 'Services extérieurs',              type: 'resultat', expectedPrefixes: /^(62|63)/,                  expectedRanges: ['62 — Services extérieurs A', '63 — Services extérieurs B'] },
  { num: '25',  label: 'Impôts et taxes',                  type: 'resultat', expectedPrefixes: /^64/,                       expectedRanges: ['64 — Impôts et taxes (hors IS)'] },
  { num: '26',  label: 'Autres charges',                   type: 'resultat', expectedPrefixes: /^65/,                       expectedRanges: ['65 — Autres charges'] },
  { num: '27A', label: 'Charges de personnel',             type: 'resultat', expectedPrefixes: /^(66|637)/,                 expectedRanges: ['66 — Charges de personnel', '637 — Personnel extérieur'] },
  { num: '28',  label: 'Provisions et dépréciations bilan',type: 'bilan',    expectedPrefixes: /^(19|29|39|49|59|151)/,     expectedRanges: ['19 — Prov. risques & charges', '29/39/49/59 — Dépréciations', '151 — Prov. réglementées'] },
  { num: '29A', label: 'Frais financiers',                 type: 'resultat', expectedPrefixes: /^67/,                       expectedRanges: ['67 — Frais financiers'] },
  { num: '29B', label: 'Revenus financiers',               type: 'resultat', expectedPrefixes: /^77/,                       expectedRanges: ['77 — Revenus financiers'] },
  // Notes 30-34
  { num: '30',  label: 'Dotations aux amortissements',     type: 'resultat', expectedPrefixes: /^(681|691)/,                expectedRanges: ['681 — Dot. amort. exploitation', '691 — Dot. amort. HAO'] },
  { num: '32',  label: 'Charges HAO',                      type: 'resultat', expectedPrefixes: /^(81|83|85)/,               expectedRanges: ['81 — VC cessions', '83 — Charges HAO', '85 — Dot. HAO'] },
  { num: '33',  label: 'Produits HAO',                     type: 'resultat', expectedPrefixes: /^(82|84|86)/,               expectedRanges: ['82 — Produits cessions', '84 — Produits HAO', '86 — Reprises HAO'] },
  { num: '34',  label: 'Impôts sur le résultat',           type: 'resultat', expectedPrefixes: /^(891|895|699)/,            expectedRanges: ['891 — IS', '895 — IRPP', '699 — Autres impôts s/résultat'] },
  // Notes informatives (35-40)
  { num: '35',  label: 'Parties liées',                    type: 'informative', expectedPrefixes: /(?!)/, expectedRanges: ['Saisie manuelle (rémunérations dirigeants, intragroupe…)'] },
  { num: '36',  label: 'Effectifs',                        type: 'informative', expectedPrefixes: /(?!)/, expectedRanges: ['Saisie manuelle + masse salariale (note 27A)'] },
  { num: '37',  label: 'Événements postérieurs',           type: 'informative', expectedPrefixes: /(?!)/, expectedRanges: ['Saisie manuelle'] },
  { num: '38',  label: 'Régime fiscal',                    type: 'informative', expectedPrefixes: /(?!)/, expectedRanges: ['Saisie manuelle + charge IS (note 34)'] },
  { num: '39',  label: 'Identification',                   type: 'informative', expectedPrefixes: /(?!)/, expectedRanges: ['Fiche signalétique entreprise (NINEA, RCCM)'] },
  { num: '40',  label: 'Approbation',                      type: 'informative', expectedPrefixes: /(?!)/, expectedRanges: ['Saisie manuelle (date AGO, signataires)'] },
];

export interface ValidationResult {
  num: string;
  label: string;
  status: 'ok' | 'warning' | 'empty' | 'informative';
  matched: number;          // comptes présents dans la balance ET attendus
  unexpected: string[];     // comptes hors plage SYSCOHADA pour cette note (ne doit jamais arriver vu nos regex, mais utile pour audit futur)
  missingMandatory: string[]; // racines attendues mais absentes de la balance
  message: string;
}

/**
 * Vérifie pour chaque note que les comptes mappés correspondent aux plages SYSCOHADA
 * et signale racines absentes ou notes vides.
 */
export function validateNotes(balance: Array<{ compte: string }>): ValidationResult[] {
  const allComptes = balance.map(b => b.compte);

  return NOTES_SPEC.map(spec => {
    if (spec.type === 'informative') {
      return {
        num: spec.num,
        label: spec.label,
        status: 'informative',
        matched: 0,
        unexpected: [],
        missingMandatory: [],
        message: 'Note informative — saisie manuelle requise',
      };
    }

    const matched = allComptes.filter(c => spec.expectedPrefixes.test(c));
    const matchedCount = matched.length;

    // Racines manquantes : on extrait les racines listées dans expectedRanges (1ers tokens numériques)
    const expectedRoots = spec.expectedRanges
      .map(r => r.match(/^(\d+)/)?.[1])
      .filter((x): x is string => !!x);
    const missingMandatory = expectedRoots.filter(
      root => !allComptes.some(c => c.startsWith(root)),
    );

    let status: ValidationResult['status'];
    let message: string;
    if (matchedCount === 0) {
      status = 'empty';
      message = `Aucun compte ${spec.expectedRanges.map(r => r.split(' ')[0]).join('/')} dans la balance`;
    } else if (missingMandatory.length > 0) {
      status = 'warning';
      message = `${matchedCount} compte(s) trouvé(s), racines manquantes : ${missingMandatory.join(', ')}`;
    } else {
      status = 'ok';
      message = `${matchedCount} compte(s) correctement mappé(s)`;
    }

    return {
      num: spec.num,
      label: spec.label,
      status,
      matched: matchedCount,
      unexpected: [],
      missingMandatory,
      message,
    };
  });
}

/**
 * Comptes présents dans la balance mais non mappés à aucune note 22-40 (hors classes 1-5 du bilan).
 * Cible classes 6, 7, 8 (charges/produits/HAO) qui devraient toutes apparaître quelque part dans les notes résultat.
 */
export function findOrphanAccounts(balance: Array<{ compte: string; intitule: string }>): Array<{ compte: string; intitule: string }> {
  const resultatSpecs = NOTES_SPEC.filter(s => s.type === 'resultat');
  return balance.filter(b => {
    if (!/^[678]/.test(b.compte)) return false;
    return !resultatSpecs.some(s => s.expectedPrefixes.test(b.compte));
  });
}
