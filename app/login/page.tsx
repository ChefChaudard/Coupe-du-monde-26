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
    async function loadUser() {
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        router.replace("/dashboard");
      }
    }

    void loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          router.replace("/dashboard");
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
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
    <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-md flex-col justify-center p-8">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.10)]">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-950">Connexion</h1>
      <p className="mb-6 text-sm text-slate-500">Accès à vos pronostics Coupe du Monde 2026.</p>

      <input
        type="email"
        placeholder="email@exemple.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-4 w-full rounded border border-slate-200 bg-white p-3 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
        autoComplete="username"
      />

      <div className="mb-4 relative">
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-slate-200 bg-white p-3 pr-24 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
          autoComplete="current-password"
        />
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
        >
          {showPassword ? "Masquer" : "Afficher"}
        </button>
      </div>

      <label className="mb-4 flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-slate-600 focus:ring-slate-500"
        />
        Se souvenir de moi
      </label>

      <button
        type="button"
        onClick={signIn}
        disabled={isSubmitting}
        className="w-full rounded bg-slate-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Se connecter
      </button>

      <div className="mt-4 space-y-2 text-sm text-slate-600">
        <p className="text-slate-500">
          Pour un nouveau mot de passe, contacte l&apos;admin de ton groupe ou un super admin.
        </p>
        <p>
          <a href="/create-account" className="font-medium text-slate-700 hover:text-slate-950">
            Créer un compte
          </a>
        </p>
      </div>

      {message && <p className="mt-4 text-sm text-red-600">{message}</p>}
      </div>
    </main>
  );
}
