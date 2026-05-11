"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fetchProfile = async (user: any) => {
      if (!user) {
        setUserEmail(null);
        setUserName(null);
        setIsAdmin(false);
        return;
      }

      setUserEmail(user.email ?? null);

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin, nickname")
        .eq("id", user.id)
        .maybeSingle();

      setIsAdmin(!!profile?.is_admin);
      setUserName(
        profile?.nickname ||
          user.email?.split("@")[0] ||
          `user_${user.id.slice(0, 8)}`
      );
    };

    async function loadInitialUser() {
      const { data } = await supabase.auth.getUser();
      await fetchProfile(data.user);
    }

    loadInitialUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        await fetchProfile(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="flex min-h-[calc(100vh-72px)] items-center justify-center bg-[#12362f] p-8 text-white">
      <div className="w-full max-w-3xl text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">
          Pronos WC26
        </p>

        <h1 className="text-5xl font-bold tracking-tight">Coupe du Monde 2026</h1>

        <p className="mx-auto mt-4 max-w-xl text-lg leading-7 text-emerald-50">
          Site de pronostics entre amis, avec scores, classements et tours
          éliminatoires au fil de la compétition.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded bg-white px-6 py-3 font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-50"
          >
            Accéder au dashboard
          </Link>

          {!userEmail && (
            <Link
              href="/login"
              className="rounded bg-sky-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              Se connecter
            </Link>
          )}

          {userEmail && (
            <Link
              href="/account/password"
              className="rounded bg-white px-6 py-3 font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-50"
            >
              Changer mon mot de passe
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin/users"
              className="rounded bg-amber-300 px-6 py-3 font-semibold text-emerald-950 shadow-sm transition hover:bg-amber-200"
            >
              Créer / gérer utilisateurs
            </Link>
          )}
        </div>

        {userName && (
          <p className="mt-6 text-sm font-semibold text-amber-100">{userName}</p>
        )}
      </div>
    </main>
  );
}