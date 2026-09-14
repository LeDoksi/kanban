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
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'code' | 'verifying'>('idle');
  const [error, setError] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Введите почту'); return; }
    setError('');
    setState('sending');
    const { error } = await sb.auth.signInWithOtp({ email: email.trim() });
    if (error) { setError(error.message); setState('idle'); return; }
    setState('code');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError('Введите код из письма'); return; }
    setError('');
    setState('verifying');
    const { error } = await sb.auth.verifyOtp({
      email: email.trim(), token: code.trim(), type: 'email',
    });
    if (error) { setError(error.message); setState('code'); return; }
  };

  if (state === 'code' || state === 'verifying') {
    return (
      <div className="min-h-dvh grid place-items-center p-6">
        <form onSubmit={verify} className="w-full max-w-72 space-y-3">
          <h1 className="text-base font-medium">Канбан</h1>
          <p className="text-sm text-(--color-muted)">
            Код ушёл на {email}.
          </p>
          <input
            autoFocus
            value={code}
            onChange={e => { setCode(e.target.value); setError(''); }}
            placeholder="123456"
            inputMode="numeric"
            maxLength={6}
            className="w-full h-9 px-3 rounded-lg bg-(--color-panel)
                       border border-(--color-line) text-sm outline-none
                       focus:border-(--color-muted)"
          />
          {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
          <button
            type="submit"
            disabled={state === 'verifying'}
            className="w-full h-9 rounded-lg bg-(--color-ink)
                       text-(--color-ground) text-sm"
          >
            {state === 'verifying' ? 'Проверяю…' : 'Войти'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <form onSubmit={send} className="w-full max-w-72 space-y-3">
        <h1 className="text-base font-medium">Канбан</h1>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
          placeholder="name@example.com"
          className="w-full h-9 px-3 rounded-lg bg-(--color-panel)
                     border border-(--color-line) text-sm outline-none
                     focus:border-(--color-muted)"
        />
        {error && <p className="text-xs text-(--color-danger-ink)">{error}</p>}
        <button
          type="submit"
          disabled={state === 'sending'}
          className="w-full h-9 rounded-lg bg-(--color-ink)
                     text-(--color-ground) text-sm"
        >
          {state === 'sending' ? 'Отправляю…' : 'Прислать код'}
        </button>
      </form>
    </div>
  );
}
