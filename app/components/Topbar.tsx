"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

const navItems = [
  { key: "home", label: "Page d'accueil", href: "/" },
  { key: "groupes", label: "Pronostics Groupes", href: "/dashboard?tab=groupes" },
  { key: "knockout", label: "Pronostics Tours Eliminatoires", href: "/knockout" },
  { key: "tours", label: "Tours suivants", href: "/dashboard?tab=tours" },
];

export default function Topbar() {
  const [userName, setUserName] = useState<string | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        setUserName(null);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single();

      setUserName(profile?.nickname ?? user.email?.split("@")[0] ?? null);
    }

    loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;

      if (!user) {
        setUserName(null);
        return;
      }

      supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          setUserName(data?.nickname ?? user.email?.split("@")[0] ?? null);
        });
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.removeItem("rememberMe");
    router.push("/");
  }

  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);

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

    loadSimulatedDate();
  }, []);

  async function updateSimulatedDate(value: string) {
    setSimulatedNow(value);

    await supabase
      .from("app_settings")
      .upsert({ key: "simulated_date", value: new Date(value).toISOString() }, { onConflict: "key" });
  }

  const currentKey = useMemo(() => {
    if (pathname === "/") return "home";
    if (pathname === "/knockout") return "knockout";
    if (pathname === "/dashboard") {
      const tab = searchParams.get("tab");
      return tab === "tours" ? "tours" : "groupes";
    }
    return null;
  }, [pathname, searchParams]);

  const visibleNavKeys = useMemo(() => {
    const mapping: Record<string, string[]> = {
      home: ["home", "groupes"],
      groupes: ["home", "knockout"],
      tours: ["home", "knockout"],
      knockout: ["home", "groupes"],
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
                onChange={(e) => updateSimulatedDate(e.target.value)}
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
