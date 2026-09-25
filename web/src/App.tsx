import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MotionConfig } from 'motion/react';
import { sb } from './supabase';
import { Board } from './Board';
import { Button } from './ui/Button';
import { Toaster } from './ui/Toaster';
import { GoogleLogo } from '@phosphor-icons/react';

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
  return (
    // reducedMotion="user" — единая точка: все motion-компоненты дерева
    // (включая Toaster) сами уважают prefers-reduced-motion, без
    // проверки в каждом из них по отдельности.
    <MotionConfig reducedMotion="user">
      {session ? <Board /> : <SignIn />}
      <Toaster />
    </MotionConfig>
  );
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
    <div className="min-h-dvh grid place-items-center p-6 bg-(--color-ground)">
      <div className="w-full max-w-80 flex flex-col items-center gap-4 text-center">
        <h1 className="text-title-lg">Канбан</h1>
        <p className="text-body text-(--color-muted)">Личная доска задач по проектам</p>
        {error && <p className="text-meta text-(--color-danger)">{error}</p>}
        <Button onClick={signIn} variant="primary" className="w-full justify-center h-11">
          <GoogleLogo size={18} weight="bold" />
          Войти через Google
        </Button>
      </div>
    </div>
  );
}
