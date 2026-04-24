"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function signIn() {
    setMessage("");

    if (!email || !password) {
      setMessage("Merci de saisir ton email et ton mot de passe.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(`Erreur connexion : ${error.message}`);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-3xl font-bold">Connexion</h1>

      <input
        type="email"
        placeholder="email@exemple.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-4 w-full rounded border p-3"
      />

      <input
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-4 w-full rounded border p-3"
      />

      <button
        onClick={signIn}
        className="w-full rounded bg-blue-600 px-4 py-3 text-white"
      >
        Se connecter
      </button>

      {message && <p className="mt-4 text-sm text-gray-700">{message}</p>}
    </main>
  );
}