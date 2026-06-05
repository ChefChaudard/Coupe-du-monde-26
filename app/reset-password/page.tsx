"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingRecovery, setLoadingRecovery] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  useEffect(() => {
    async function resolveRecoverySession() {
      if (!code && !tokenHash) {
        setMessage(
          "Cette page est réservée à la finalisation d’un compte ou d’un mot de passe envoyé par l’admin."
        );
        return;
      }

      setLoadingRecovery(true);
      setMessage(null);

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            setMessage(error.message);
            return;
          }
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type === "email" ? "recovery" : "recovery",
          });

          if (error) {
            setMessage(error.message);
            return;
          }
        }

        const { data } = await supabase.auth.getUser();
        setRecoveryEmail(data.user?.email ?? null);
        setRecoveryReady(true);
        setMessage("Lien de réinitialisation validé. Choisis un nouveau mot de passe.");
      } finally {
        setLoadingRecovery(false);
      }
    }

    void resolveRecoverySession();
  }, [code, tokenHash, type]);

  async function handleRecoverySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!newPassword || !confirmPassword) {
      setMessage("Veuillez remplir tous les champs.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }

    if (newPassword.length < 6) {
      setMessage("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoadingRecovery(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      await supabase.auth.signOut({ scope: "local" });
      setNewPassword("");
      setConfirmPassword("");
      setRecoveryReady(false);
      setRecoveryEmail(null);
      router.push("/login");
    } finally {
      setLoadingRecovery(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-xl flex-col justify-center p-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.10)] sm:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">
          Créer un mot de passe
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {recoveryReady
            ? "Définis un nouveau mot de passe pour finaliser ton compte."
            : "Cette page sert à terminer la création d’un compte ou à appliquer un mot de passe envoyé par un admin."}
        </p>

        {loadingRecovery && !recoveryReady && (
          <p className="mt-4 text-sm text-slate-600">
            Validation du lien de réinitialisation en cours...
          </p>
        )}

        {recoveryReady ? (
          <form onSubmit={handleRecoverySubmit} className="mt-6 space-y-4">
            {recoveryEmail && (
              <p className="text-sm text-slate-600">
                Compte concerné : <strong>{recoveryEmail}</strong>
              </p>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={6}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={6}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </div>

            {message && <p className="text-sm text-slate-700">{message}</p>}

            <button
              type="submit"
              disabled={loadingRecovery}
              className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingRecovery ? "Validation en cours..." : "Créer le mot de passe"}
            </button>
          </form>
        ) : (
          <div className="mt-6 space-y-3">
            {message && <p className="text-sm text-slate-700">{message}</p>}

            <a
              href="/login"
              className="inline-flex rounded-xl border border-slate-200 px-4 py-3 text-center font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
            >
              Retour à la connexion
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl p-8 text-sm text-slate-600">Chargement...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}