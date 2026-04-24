"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(`Erreur inscription: ${error.message}`);
      setLoading(false);
      return;
    }

    setMessage("Compte créé. Tu peux maintenant te connecter.");
    setLoading(false);
  }

async function handleLogin() {
  setLoading(true);
  setMessage("");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setMessage(`Erreur connexion: ${error.message}`);
    setLoading(false);
    return;
  }

  window.location.href = "/dashboard";
}

  return (
    <main className="p-10 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-6">Connexion</h1>

      <input
        type="email"
        placeholder="ton email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border p-2 w-full mb-4"
      />

      <input
        type="password"
        placeholder="ton mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="border p-2 w-full mb-4"
      />

      <div className="flex gap-3">
        <button
          onClick={handleLogin}
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
        >
          Se connecter
        </button>

        <button
          onClick={handleSignUp}
          disabled={loading}
          className="bg-gray-200 text-black px-4 py-2 rounded disabled:opacity-50"
        >
          Créer un compte
        </button>
      </div>

      {message && <p className="mt-4 text-sm">{message}</p>}
    </main>
  );
}