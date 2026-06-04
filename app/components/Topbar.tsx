"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import GroupSelector from "@/app/components/GroupSelector";
import { ROLE_SUPER_ADMIN } from "@/lib/roles";
import {
  DEFAULT_TIME_ZONE,
  formatTimeZoneLabel,
  getSafeTimeZone,
  getStoredTimeZone,
  getTimeZoneOptions,
  setStoredTimeZone,
  USER_TIME_ZONE_UPDATED_EVENT,
} from "@/app/lib/time-zone";

const navItems = [
  { key: "home", label: "Accueil", href: "/" },
  { key: "groupes", label: "Groupes", href: "/dashboard?tab=groupes" },
  { key: "knockout", label: "2e tours", href: "/knockout" },
  { key: "realKnockout", label: "2e tours Réels", href: "/real-knockout" },
  { key: "tours", label: "Tours suivants", href: "/dashboard?tab=tours" },
];

type CurrentUserResponse = {
  user: {
    email?: string | null;
    nickname?: string | null;
    timeZone?: string | null;
    roles?: string[] | null;
  } | null;
};

async function fetchCurrentUser() {
  const response = await fetch("/api/me", { cache: "no-store" });

  if (!response.ok) return null;

  const payload = (await response.json()) as CurrentUserResponse;
  return payload.user;
}

function formatDateTimeLocalValue(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60000
  );

  return localDate.toISOString().slice(0, 16);
}

export default function Topbar() {
  const [userName, setUserName] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [timeZoneError, setTimeZoneError] = useState("");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const [simulatedDateError, setSimulatedDateError] = useState("");

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const timeZoneOptions = useMemo(() => getTimeZoneOptions(), []);

  useEffect(() => {
    async function loadCurrentUser() {
      const apiUser = await fetchCurrentUser();

      if (!apiUser) {
        setIsAuthenticated(false);
        setIsSuperAdmin(false);
        setUserName(null);
        setTimeZone(getStoredTimeZone() ?? DEFAULT_TIME_ZONE);
        return;
      }

      setIsAuthenticated(true);
      setIsSuperAdmin(
        apiUser.roles?.includes(ROLE_SUPER_ADMIN) ?? false
      );

      setUserName(
        apiUser.nickname || apiUser.email?.split("@")[0] || null
      );

      setTimeZone(getSafeTimeZone(apiUser.timeZone || getStoredTimeZone()));
    }

    void loadCurrentUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session?.user) {
          setIsAuthenticated(false);
          setIsSuperAdmin(false);
          setUserName(null);
          setTimeZone(getStoredTimeZone() ?? DEFAULT_TIME_ZONE);
          return;
        }

        setIsAuthenticated(true);
        await loadCurrentUser();
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) {
      setSimulatedNow(null);
      setSimulatedDateError("");
      return;
    }

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
  }, [isSuperAdmin]);

  async function handleLogout() {
    await Promise.allSettled([
      supabase.auth.signOut(),
      fetch("/api/auth/signout", {
        method: "POST",
        cache: "no-store",
      }),
    ]);
    setIsAuthenticated(false);
    setIsSuperAdmin(false);
    setUserName(null);
    setSimulatedNow(null);
    setSimulatedDateError("");
    localStorage.removeItem("rememberMe");
    window.location.assign("/login");
  }

  async function updateSimulatedDate(value: string) {
    const nextDate = new Date(value);

    if (Number.isNaN(nextDate.getTime())) return;

    const nextValue = nextDate.toISOString();
    const previousValue = simulatedNow;

    setSimulatedDateError("");
    setSimulatedNow(nextValue);

    const { data, error } = await supabase
      .from("app_settings")
      .update({
        value: nextValue,
        updated_at: new Date().toISOString(),
      })
      .eq("key", "simulated_date")
      .select("key")
      .maybeSingle();

    if (error || !data) {
      setSimulatedNow(previousValue);

      setSimulatedDateError(
        error?.message ??
          "Date simulée introuvable dans les réglages."
      );

      return;
    }

    window.dispatchEvent(
      new CustomEvent("simulated-date-updated", {
        detail: nextValue,
      })
    );

    router.refresh();
  }

  async function updateTimeZone(nextTimeZone: string) {
    const previousTimeZone = timeZone;
    const safeTimeZone = getSafeTimeZone(nextTimeZone);

    setTimeZoneError("");
    setTimeZone(safeTimeZone);

    if (!isAuthenticated) {
      setStoredTimeZone(safeTimeZone);

      window.dispatchEvent(
        new CustomEvent(USER_TIME_ZONE_UPDATED_EVENT, {
          detail: safeTimeZone,
        })
      );

      router.refresh();
      return;
    }

    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeZone: safeTimeZone,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      setTimeZone(previousTimeZone);

      setTimeZoneError(
        payload.error ??
          "Impossible de sauvegarder le fuseau horaire."
      );

      return;
    }

    window.dispatchEvent(
      new CustomEvent(USER_TIME_ZONE_UPDATED_EVENT, {
        detail: safeTimeZone,
      })
    );

    setStoredTimeZone(safeTimeZone);

    router.refresh();
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

    return mapping[currentKey ?? "home"] ?? [
      "home",
      "groupes",
    ];
  }, [currentKey]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1600px] flex-nowrap items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-slate-900 text-xs font-semibold text-white shadow-sm">
            WC
          </span>
          <span className="leading-tight">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Pronos
            </span>
            <span className="block text-[13px] font-semibold text-slate-900">
              Coupe du Monde 2026
            </span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1.5 lg:ml-3">
          {navItems
            .filter((item) => visibleNavKeys.includes(item.key))
            .map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
                  currentKey === item.key
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-2.5">
          <GroupSelector />

          {isSuperAdmin && simulatedNow && (
            <div className="relative shrink-0">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm sm:text-sm">
                  <span className="font-medium text-slate-500">Simulation</span>

                  <input
                    type="datetime-local"
                    value={formatDateTimeLocalValue(simulatedNow)}
                    onChange={(event) =>
                      updateSimulatedDate(event.target.value)
                    }
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:text-sm"
                  />
                </label>

                <button
                  type="button"
                  onClick={() =>
                    void updateSimulatedDate(new Date().toISOString())
                  }
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 sm:px-4 sm:py-2 sm:text-sm"
                >
                  Maintenant
                </button>
              </div>

              {simulatedDateError && (
                <p className="absolute left-3 top-full mt-1 whitespace-nowrap text-xs text-red-600">
                  {simulatedDateError}
                </p>
              )}
            </div>
          )}

          <div className="relative shrink-0">
            <label className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm sm:text-sm">
              <span className="font-medium text-slate-500">Fuseau</span>

              <select
                value={timeZone}
                onChange={(event) => updateTimeZone(event.target.value)}
                className="max-w-[170px] rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:text-sm"
              >
                {timeZoneOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatTimeZoneLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            {timeZoneError && (
              <p className="absolute left-3 top-full mt-1 whitespace-nowrap text-xs text-red-600">
                {timeZoneError}
              </p>
            )}
          </div>

          {userName ? (
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 sm:px-4 sm:py-2 sm:text-sm"
              >
                Déconnexion
              </button>

              <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-900 sm:py-2 sm:text-sm">
                {userName}
              </span>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
              <Link
                href="/login"
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:px-4 sm:py-2 sm:text-sm"
              >
                Se connecter
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}