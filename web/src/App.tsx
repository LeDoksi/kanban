import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';
import { Board } from './Board';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <SignIn />;
  return <Board />;
}

function SignIn() {
  const [error, setError] = useState('');

  const signIn = async () => {
    setError('');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="w-full max-w-72 space-y-3 text-center">
        <h1 className="text-base font-medium">Канбан</h1>
        {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
        <button
          onClick={signIn}
          className="w-full h-9 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          Войти через Google
        </button>
      </div>
    </div>
  );
}
