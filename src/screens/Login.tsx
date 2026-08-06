import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setBusy(false);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold">Dynamo – statistiky</h1>
        <p className="mt-1 mb-5 text-sm text-slate-400">
          Přihlaste se stejným účtem jako do skladu.
        </p>

        <label className="label" htmlFor="email">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          className="field mb-3"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="label" htmlFor="password">
          Heslo
        </label>
        <input
          id="password"
          type="password"
          className="field mb-4"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p className="mb-3 rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Přihlašuji…" : "Přihlásit se"}
        </button>

        <p className="mt-4 text-xs text-slate-500">
          Zapsané údaje zůstávají v zařízení, takže po prvním přihlášení funguje
          aplikace i bez signálu.
        </p>
      </form>
    </div>
  );
}
