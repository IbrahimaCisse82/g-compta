import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (!hash.includes('type=recovery')) {
      navigate('/');
    }
  }, [navigate]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message);
    else {
      toast.success('Mot de passe mis à jour.');
      navigate('/');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5"
      style={{ background: 'radial-gradient(ellipse at 65% 15%, rgba(56,189,248,.07) 0%, transparent 55%), hsl(var(--background))' }}>
      <h1 className="font-serif text-4xl text-primary mb-6">Nouveau mot de passe</h1>
      <form onSubmit={handleReset} className="bg-bg2 border border-border rounded-xl p-6 w-full max-w-[400px] space-y-3">
        <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Nouveau mot de passe" className="w-full bg-bg3 border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary" />
        <button type="submit" disabled={loading} className="w-full py-2 rounded-lg font-semibold text-sm bg-primary text-primary-foreground disabled:opacity-50">
          {loading ? '...' : 'Mettre à jour'}
        </button>
      </form>
    </div>
  );
}
