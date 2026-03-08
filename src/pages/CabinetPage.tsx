import { useState } from 'react';
import { useApp } from '@/stores/app-store';
import { useAuth } from '@/hooks/useAuth';
import { useCabinet } from '@/hooks/use-cabinet';

const ROLE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  admin: { label: '👑 Admin', color: 'text-accent', desc: 'Accès complet, gère les membres' },
  comptable: { label: '📋 Comptable', color: 'text-primary', desc: 'Saisie, consultation, export' },
  lecteur: { label: '👁️ Lecteur', color: 'text-fg3', desc: 'Consultation uniquement' },
};

export default function CabinetPage() {
  const { entreprise, entreprises, demo } = useApp();
  const { user } = useAuth();
  const {
    cabinet, members, invitations, pendingInvitations, loading, userRole,
    createCabinet, inviteUser, acceptInvitation, declineInvitation,
    updateMemberRole, removeMember, cancelInvitation,
    linkEntreprise, unlinkEntreprise,
  } = useCabinet(user?.id);

  const [cabinetName, setCabinetName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'comptable' | 'lecteur'>('comptable');
  const [showInvite, setShowInvite] = useState(false);

  const isAdmin = userRole === 'admin';

  if (demo) {
    return (
      <div>
        <div className="h-12 bg-bg2 border-b border-border flex items-center px-5">
          <div className="font-serif text-[17px]">⚖️ Gestion du Cabinet</div>
        </div>
        <div className="p-5">
          <div className="bg-accent/10 text-accent rounded-lg px-4 py-3 text-xs">
            ⚡ En mode démo, la gestion du cabinet n'est pas disponible. Connectez-vous pour créer votre cabinet.
          </div>
        </div>
      </div>
    );
  }

  // Pending invitations for current user
  if (pendingInvitations.length > 0) {
    return (
      <div>
        <div className="h-12 bg-bg2 border-b border-border flex items-center px-5">
          <div className="font-serif text-[17px]">📬 Invitations en attente</div>
        </div>
        <div className="p-5 space-y-3">
          {pendingInvitations.map(inv => (
            <div key={inv.id} className="bg-bg2 border border-border rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-foreground">Invitation à rejoindre un cabinet</div>
                <div className="text-[10px] text-fg3 font-mono mt-1">
                  Rôle proposé : <span className={ROLE_LABELS[inv.role]?.color}>{ROLE_LABELS[inv.role]?.label}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => acceptInvitation(inv)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-success text-success-foreground">
                  ✓ Accepter
                </button>
                <button onClick={() => declineInvitation(inv.id)}
                  className="px-3 py-1.5 rounded-md text-xs border border-destructive/30 text-destructive">
                  ✕ Décliner
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // No cabinet yet — create one
  if (!cabinet) {
    return (
      <div>
        <div className="h-12 bg-bg2 border-b border-border flex items-center px-5">
          <div className="font-serif text-[17px]">⚖️ Créer un Cabinet</div>
        </div>
        <div className="p-5">
          <div className="bg-bg2 border border-border rounded-lg p-6 max-w-md">
            <p className="text-xs text-fg2 mb-4">
              Créez votre cabinet pour gérer plusieurs entreprises et inviter des collaborateurs.
            </p>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={cabinetName}
                onChange={e => setCabinetName(e.target.value)}
                placeholder="Nom du cabinet (ex: Cabinet Diallo & Associés)"
                className="bg-bg3 border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <button
                onClick={() => { if (cabinetName.trim()) createCabinet(cabinetName.trim()); }}
                disabled={!cabinetName.trim() || loading}
                className="px-4 py-2 rounded-lg font-semibold text-sm bg-primary text-primary-foreground disabled:opacity-50"
              >
                🏛️ Créer le Cabinet
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Cabinet exists — show management
  return (
    <div>
      <div className="h-12 bg-bg2 border-b border-border flex items-center justify-between px-5">
        <div>
          <div className="font-serif text-[17px]">⚖️ {cabinet.nom}</div>
          <div className="text-[10px] text-fg3 font-mono">
            {members.length} membre(s) · {ROLE_LABELS[userRole || 'lecteur']?.label}
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setShowInvite(!showInvite)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground">
            ➕ Inviter
          </button>
        )}
      </div>
      <div className="p-5 space-y-4">

        {/* Invitation form */}
        {showInvite && isAdmin && (
          <div className="bg-bg2 border border-primary/30 rounded-lg p-4">
            <div className="text-xs font-bold text-primary mb-3">📬 Inviter un collaborateur</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="Email du collaborateur"
                className="flex-1 bg-bg3 border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as any)}
                className="bg-bg3 border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none"
              >
                <option value="comptable">📋 Comptable</option>
                <option value="lecteur">👁️ Lecteur</option>
                <option value="admin">👑 Admin</option>
              </select>
              <button
                onClick={() => {
                  if (inviteEmail.trim()) {
                    inviteUser(inviteEmail.trim(), inviteRole);
                    setInviteEmail('');
                  }
                }}
                disabled={!inviteEmail.trim() || loading}
                className="px-4 py-2 rounded-md text-xs font-semibold bg-accent text-accent-foreground disabled:opacity-50"
              >
                Envoyer
              </button>
            </div>
            <div className="mt-2 text-[10px] text-fg3">
              Le collaborateur recevra l'invitation dans G-Compta à sa prochaine connexion.
            </div>
          </div>
        )}

        {/* Members */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-bg3">
            <div className="text-xs font-bold text-foreground">👥 Membres du cabinet</div>
          </div>
          <div className="divide-y divide-border/30">
            {members.map(m => (
              <div key={m.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {m.full_name || 'Sans nom'}
                    {m.user_id === cabinet.owner_id && <span className="ml-1 text-[9px] text-accent font-mono">propriétaire</span>}
                  </div>
                  <div className="text-[10px] text-fg3 font-mono">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${ROLE_LABELS[m.role]?.color}`}>
                    {ROLE_LABELS[m.role]?.label}
                  </span>
                  {isAdmin && m.user_id !== user?.id && (
                    <div className="flex gap-1">
                      <select
                        value={m.role}
                        onChange={e => updateMemberRole(m.id, e.target.value as any)}
                        className="bg-bg3 border border-border rounded px-1.5 py-0.5 text-[10px] text-foreground outline-none"
                      >
                        <option value="admin">Admin</option>
                        <option value="comptable">Comptable</option>
                        <option value="lecteur">Lecteur</option>
                      </select>
                      <button onClick={() => removeMember(m.id)}
                        className="text-[10px] text-destructive hover:underline">✕</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending invitations */}
        {invitations.filter(i => i.status === 'pending').length > 0 && (
          <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-bg3">
              <div className="text-xs font-bold text-foreground">📬 Invitations en attente</div>
            </div>
            <div className="divide-y divide-border/30">
              {invitations.filter(i => i.status === 'pending').map(inv => (
                <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-foreground">{inv.email}</div>
                    <div className="text-[10px] text-fg3 font-mono">
                      Rôle : {ROLE_LABELS[inv.role]?.label} · Envoyée le {new Date(inv.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => cancelInvitation(inv.id)}
                      className="text-[10px] text-destructive hover:underline">Annuler</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Entreprises linked to cabinet */}
        <div className="bg-bg2 border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-bg3">
            <div className="text-xs font-bold text-foreground">🏭 Entreprises du cabinet</div>
          </div>
          <div className="divide-y divide-border/30">
            {entreprises.length === 0 && (
              <div className="px-4 py-6 text-center text-fg3 text-xs">Aucune entreprise</div>
            )}
            {entreprises.map(ent => (
              <div key={ent.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">{ent.nom}</div>
                  <div className="text-[10px] text-fg3 font-mono">
                    {ent.sigle && `${ent.sigle} · `}{ent.ninea || '—'} · {ent.forme_juridique || '—'}
                  </div>
                </div>
                {isAdmin && (
                  <button onClick={() => linkEntreprise(ent.id)}
                    className="text-[10px] text-primary hover:underline">Lier au cabinet</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Roles legend */}
        <div className="bg-bg2 border border-border rounded-lg p-4">
          <div className="text-xs font-bold text-foreground mb-2">📖 Rôles disponibles</div>
          <div className="space-y-1.5">
            {Object.entries(ROLE_LABELS).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`text-xs font-bold ${val.color}`}>{val.label}</span>
                <span className="text-[10px] text-fg3">— {val.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
