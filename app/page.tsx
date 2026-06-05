"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  USER_TIME_ZONE_UPDATED_EVENT,
  getSafeTimeZone,
} from "@/app/lib/time-zone";

type ApiUser = {
  email?: string | null;
  nickname?: string | null;
  roles?: string[];
  timeZone?: string | null;
};

export default function Home() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<ApiUser | null>(null);

  useEffect(() => {
    document.title = "Accueil | Pronos WC26";
  }, []);

  useEffect(() => {
    async function loadInitialUser() {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!res.ok) {
          setUserEmail(null);
          setUserName(null);
          setProfile(null);
          setIsAdmin(false);
          return;
        }

        const payload = (await res.json()) as {
          user?: {
            email?: string | null;
            nickname?: string | null;
            roles?: string[];
            timeZone?: string | null;
          } | null;
        };

        const apiUser = payload.user ?? null;
        if (!apiUser) {
          setUserEmail(null);
          setUserName(null);
          setProfile(null);
          setIsAdmin(false);
          return;
        }

        setUserEmail(apiUser.email ?? null);
        setUserName(apiUser.nickname ?? apiUser.email?.split("@")[0] ?? null);
        setProfile(apiUser);
        const roles = apiUser.roles ?? [];
        setIsAdmin(roles.includes("admin") || roles.includes("super_admin"));
      } catch {
        setUserEmail(null);
        setUserName(null);
        setProfile(null);
        setIsAdmin(false);
      }
    }

    void loadInitialUser();

    const { data: listener } = supabase.auth.onAuthStateChange(async () => {
      void loadInitialUser();
    });

    function handleTimeZoneUpdated(event: Event) {
      const nextTimeZone = (event as CustomEvent<string>).detail;
      const safeTimeZone = getSafeTimeZone(nextTimeZone);

      setProfile((current) =>
        current ? { ...current, timeZone: safeTimeZone } : current
      );
    }

    function handleWindowFocus() {
      void loadInitialUser();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadInitialUser();
      }
    }

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("pageshow", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(USER_TIME_ZONE_UPDATED_EVENT, handleTimeZoneUpdated);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("pageshow", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(
        USER_TIME_ZONE_UPDATED_EVENT,
        handleTimeZoneUpdated
      );
    };
  }, []);

  return (
    <main className="py-8 sm:py-10">
      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white/85 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Pronos WC26
          </p>

          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Coupe du Monde 2026
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Une interface de pronostics claire et rapide: groupes, tours éliminatoires,
            classement live et suivi des points sans surcharge visuelle.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Accéder au dashboard
          </Link>

          {!userEmail && (
            <>
              <Link
                href="/create-account"
                className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Créer un compte
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Se connecter
              </Link>
            </>
          )}

          {userEmail && (
            <Link
              href="/account/password"
              className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              Changer mon mot de passe
            </Link>
          )}

          {isAdmin && (
            <>
              <Link
                href="/admin/users"
                className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Comptes et mots de passe
              </Link>
              <Link
                href="/admin/groups"
                className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Créer / gérer groupes
              </Link>
            </>
          )}
          </div>

          {userName && (
            <div className="mt-6 max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left text-sm text-slate-600">
              <p className="text-base font-semibold text-slate-900">{userName}</p>
              {profile && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <p><span className="font-medium text-slate-500">Email :</span> {profile.email ?? "—"}</p>
                  <p><span className="font-medium text-slate-500">Rôle :</span> {profile.roles?.join(", ") ?? "Aucun"}</p>
                  <p><span className="font-medium text-slate-500">Fuseau :</span> {profile.timeZone ?? "—"}</p>
                  <p><span className="font-medium text-slate-500">Admin :</span> {isAdmin ? "oui" : "non"}</p>
                </div>
              )}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}