"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
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

        <div className="flex gap-4 justify-center flex-wrap">
          <Link
            href="/dashboard"
            className="rounded bg-white px-6 py-3 font-semibold text-green-900 hover:bg-gray-100"
          >
            Accéder au dashboard
          </Link>

          {!user ? (
            <Link
              href="/login"
              className="rounded bg-blue-600 px-6 py-3 font-semibold text-white"
            >
              Se connecter
            </Link>
          ) : (
            <button
              onClick={handleLogout}
              className="rounded bg-red-600 px-6 py-3 font-semibold text-white"
            >
              Se déconnecter
            </button>
          )}
        </div>

        {user && (
          <p className="text-sm text-gray-200">
            Connecté en tant que : {user.email}
          </p>
        )}
      </div>
    </main>
  );
}