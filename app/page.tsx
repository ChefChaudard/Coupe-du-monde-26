"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setUserEmail(user?.email ?? null);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_admin, nickname")
          .eq("id", user.id)
          .single();

        setIsAdmin(!!profile?.is_admin);
        setUserName(profile?.nickname ?? user.email?.split("@")[0] ?? null);
      }
    }

    loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user;
        setUserEmail(user?.email ?? null);

        if (user) {
          supabase
            .from("profiles")
            .select("is_admin, nickname")
            .eq("id", user.id)
            .single()
            .then(({ data }) => {
              setIsAdmin(!!data?.is_admin);
              setUserName(data?.nickname ?? user?.email?.split("@")[0] ?? null);
            });
        } else {
          setIsAdmin(false);
          setUserName(null);
        }
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="min-h-screen bg-green-900 text-white flex items-center justify-center p-8">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Coupe du Monde 2026</h1>
        <p className="text-xl">Site de pronostics entre amis</p>

        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded bg-white px-6 py-3 font-semibold text-green-900 hover:bg-gray-100"
          >
            Accéder au dashboard
          </Link>

          {!userEmail && (
            <Link
              href="/login"
              className="rounded bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Se connecter
            </Link>
          )}

          {userEmail && (
            <Link
              href="/account/password"
              className="rounded bg-white px-6 py-3 font-semibold text-green-900 hover:bg-gray-100"
            >
              Changer mon mot de passe
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/admin/users"
              className="rounded bg-yellow-400 px-6 py-3 font-semibold text-green-950 hover:bg-yellow-300"
            >
              Créer / gérer utilisateurs
            </Link>
          )}
        </div>

        {userName && (
          <p className="text-sm text-gray-200">
            Connecté en tant que : {userName}
          </p>
        )}
      </div>
    </main>
  );
}
