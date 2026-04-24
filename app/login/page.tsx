"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const REMEMBER_EMAIL_KEY = "pronos_cdm_remember_email";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBER_EMAIL_KEY);

    if (savedEmail) {
      setEmail(savedEmail);
      setRememberEmail(true);
    }
  }, []);

  async function signIn() {
    setMessage("");

    if (!email) {
      setMessage("Merci de saisir ton email.");
      return;
    }

    if (rememberEmail) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Lien de connexion envoyé par email.");
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-3xl font-bold">Connexion</h1>

      <input
        type="email"
        placeholder="ton@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-4 w-full rounded border p-3"
      />

      <label className="mb-6 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={rememberEmail}
          onChange={(e) => setRememberEmail(e.target.checked)}
        />
        Se souvenir de mon email sur cet ordinateur
      </label>

      <button
        onClick={signIn}
        className="w-full rounded bg-blue-600 px-4 py-3 text-white"
      >
        Recevoir un lien magique
      </button>

      {message && <p className="mt-4 text-sm text-gray-700">{message}</p>}
    </main>
  );
}