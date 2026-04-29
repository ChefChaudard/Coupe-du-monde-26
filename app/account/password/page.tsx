"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email ?? null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single();

      setUserName(profile?.nickname ?? user.email?.split("@")[0] ?? null);
    }

    loadUser();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
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

    if (!userEmail) {
      setMessage("Impossible de récupérer l'utilisateur connecté.");
      return;
    }

    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: oldPassword,
    });

    if (authError) {
      setLoading(false);
      setMessage("Ancien mot de passe incorrect.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setLoading(false);

    if (updateError) {
      setMessage(updateError.message);
      return;
    }

    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Mot de passe mis à jour avec succès.");
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-6 text-3xl font-bold">Changer mon mot de passe</h1>

      {userName && (
        <p className="mb-6 text-sm text-slate-600">
          Utilisateur connecté : <strong>{userName}</strong>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Ancien mot de passe</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            minLength={6}
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Nouveau mot de passe</label>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={6}
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Confirmer le nouveau mot de passe</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={6}
            className="w-full rounded border p-3"
          />
        </div>

        {message && <p className="text-sm text-red-600">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Validation en cours..." : "Mettre à jour le mot de passe"}
        </button>
      </form>
    </main>
  );
}
