"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserEmail(session?.user?.email ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.reload();
  }

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

          {!userEmail ? (
            <Link
              href="/login"
              className="rounded bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Se connecter
            </Link>
          ) : (
            <button
              onClick={handleLogout}
              className="rounded bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700"
            >
              Se déconnecter
            </button>
          )}

          <Link
            href="/admin/users"
            className="rounded bg-yellow-400 px-6 py-3 font-semibold text-green-950 hover:bg-yellow-300"
          >
            Créer un utilisateur
          </Link>
        </div>

        {userEmail && (
          <p className="text-sm text-gray-200">
            Connecté en tant que : {userEmail}
          </p>
        )}
      </div>
    </main>
  );
}