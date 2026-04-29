"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const remembered = localStorage.getItem("rememberMe") === "true";
    if (!remembered) return;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.push("/dashboard");
      }
    });
  }, [router]);

  async function signIn() {
    setMessage("");

    if (!email || !password) {
      setMessage("Merci de saisir ton email et ton mot de passe.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsSubmitting(false);

    if (error) {
      setMessage(`Erreur connexion : ${error.message}`);
      return;
    }

    if (rememberMe) {
      localStorage.setItem("rememberMe", "true");
    } else {
      localStorage.removeItem("rememberMe");
    }

    router.push("/dashboard");
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
        autoComplete="username"
      />

      <div className="mb-4 relative">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border p-3 pr-24"
          autoComplete="current-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-gray-100 px-3 py-1 text-sm text-gray-700"
        >
          {showPassword ? "Masquer" : "Afficher"}
        </button>
      </div>

      <label className="mb-4 flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        Se souvenir de moi
      </label>

      <button
        onClick={signIn}
        disabled={isSubmitting}
        className="w-full rounded bg-blue-600 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        Se connecter
      </button>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <a href="/reset-password" className="text-blue-600 hover:underline">
          Mot de passe oublié ?
        </a>
        <span className="italic">Afficher le mot de passe si nécessaire.</span>
      </div>

      {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
    </main>
  );
}