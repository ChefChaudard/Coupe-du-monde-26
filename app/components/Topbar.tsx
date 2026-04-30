"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const navItems = [
  { key: "home", label: "Page d'accueil", href: "/" },
  { key: "groupes", label: "Pronostics Groupes", href: "/dashboard?tab=groupes" },
  { key: "knockout", label: "Pronostics Tours Eliminatoires", href: "/knockout" },
  { key: "realKnockout", label: "Pronostics Réels 2nd Tour", href: "/real-knockout" },
  { key: "tours", label: "Tours suivants", href: "/dashboard?tab=tours" },
];

type CurrentUserResponse = {
  user: {
    nickname?: string | null;
  } | null;
};

async function fetchCurrentNickname() {
  const response = await fetch("/api/me", { cache: "no-store" });

  if (!response.ok) return null;

  const payload = (await response.json()) as CurrentUserResponse;
  return payload.user?.nickname ?? null;
}

export default function Topbar() {
  const [userName, setUserName] = useState<string | null>(null);
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    void fetchCurrentNickname().then(setUserName);

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          setUserName(null);
          return;
        }

        void fetchCurrentNickname().then(setUserName);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadSimulatedDate() {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "simulated_date")
        .single();

      if (data?.value) {
        setSimulatedNow(data.value);
      } else {
        setSimulatedNow(new Date().toISOString());
      }
    }

    void loadSimulatedDate();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("rememberMe");
    router.push("/");
  }

  async function updateSimulatedDate(value: string) {
    setSimulatedNow(value);

    await supabase
      .from("app_settings")
      .upsert(
        { key: "simulated_date", value: new Date(value).toISOString() },
        { onConflict: "key" }
      );
  }

  const currentKey = useMemo(() => {
    if (pathname === "/") return "home";
    if (pathname === "/knockout") return "knockout";
    if (pathname === "/real-knockout") return "realKnockout";
    if (pathname === "/dashboard") {
      const tab = searchParams.get("tab");
      return tab === "tours" ? "tours" : "groupes";
    }
    return null;
  }, [pathname, searchParams]);

  const visibleNavKeys = useMemo(() => {
    const mapping: Record<string, string[]> = {
      home: ["groupes", "knockout", "realKnockout"],
      groupes: ["home", "knockout", "realKnockout"],
      tours: ["home", "knockout", "realKnockout"],
      knockout: ["home", "groupes", "realKnockout"],
      realKnockout: ["home", "groupes", "knockout"],
    };

    return mapping[currentKey ?? "home"] ?? ["home", "groupes"];
  }, [currentKey]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap items-center gap-2">
          {navItems
            .filter((item) => visibleNavKeys.includes(item.key))
            .map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-200"
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          {simulatedNow && (
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">
              <span>Date simulée</span>
              <input
                type="datetime-local"
                value={new Date(simulatedNow).toISOString().slice(0, 16)}
                onChange={(event) => updateSimulatedDate(event.target.value)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
              />
            </label>
          )}

          {userName && (
            <span className="text-sm text-slate-700">Connecté : {userName}</span>
          )}

          {userName ? (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Déconnexion
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
