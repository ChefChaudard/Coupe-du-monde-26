"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type CreateAccountResponse = {
  ok?: boolean;
  error?: string;
  warning?: string | null;
};

export default function CreateAccountPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setWarning(null);

    if (!firstName || !lastName || !nickname || !email || !password || !confirmPassword) {
      setMessage("Merci de remplir tous les champs.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Les deux mots de passe ne correspondent pas.");
      return;
    }

    if (password.length < 6) {
      setMessage("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/account/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          firstName,
          lastName,
            nickname,
          email,
          password,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CreateAccountResponse;

      if (!response.ok) {
        setMessage(payload.error ?? "Impossible de créer le compte.");
        return;
      }

      setMessage("Compte créé. Le mot de passe est enregistré.");
      setWarning(payload.warning ?? null);
      setFirstName("");
      setLastName("");
      setNickname("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-xl flex-col justify-center p-8">
      <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.10)] backdrop-blur sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          Pronos WC26
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
          Créer un compte
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Renseigne tes informations. Ton compte sera créé avec ton email comme userid, puis l&apos;admin de ton groupe pourra t&apos;associer à un groupe.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Prénom</span>
              <input
                type="text"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Nom</span>
              <input
                type="text"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Pseudo</span>
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              autoComplete="nickname"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
            />
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Userid / adresse mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Mot de passe</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </label>

            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Confirmer le mot de passe</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
              />
            </label>
          </div>

          {message && <p className="text-sm text-slate-700">{message}</p>}
          {warning && <p className="text-sm text-amber-700">{warning}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-slate-900 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Création en cours..." : "Créer mon compte"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-3 text-sm">
          <Link href="/" className="font-medium text-slate-600 hover:text-slate-950">
            Retour à l&apos;accueil
          </Link>
          <Link href="/login" className="font-medium text-sky-700 hover:text-sky-800">
            J&apos;ai déjà un compte
          </Link>
        </div>
      </div>
    </main>
  );
}