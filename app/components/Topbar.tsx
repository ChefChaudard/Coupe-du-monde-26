"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_TIME_ZONE,
  formatTimeZoneLabel,
  getSafeTimeZone,
  getTimeZoneOptions,
  USER_TIME_ZONE_UPDATED_EVENT,
} from "@/app/lib/time-zone";

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
    timeZone?: string | null;
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

      const { data: authData } = await supabase.auth.getUser();
      const authUser = authData.user;

      if (!authUser) {
        setUserName(null);
        setTimeZone(DEFAULT_TIME_ZONE);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname, time_zone")
        .eq("id", authUser.id)
        .maybeSingle();

      setUserName(
        profile?.nickname ||
          apiUser?.nickname ||
          authUser.email?.split("@")[0] ||
          `user_${authUser.id.slice(0, 8)}`
      );

      setTimeZone(
        getSafeTimeZone(profile?.time_zone || apiUser?.timeZone)
      );
    }

    void loadCurrentUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session?.user) {
          setUserName(null);
          setTimeZone(DEFAULT_TIME_ZONE);
          return;
        }

        await loadCurrentUser();
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

    setTimeZoneError("");
    setTimeZone(nextTimeZone);

    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeZone: nextTimeZone,
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
        detail: nextTimeZone,
      })
    );

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
    <header className="sticky top-0 z-50 overflow-x-auto border-b border-emerald-900/10 bg-white/90 shadow-[0_10px_30px_rgba(15,118,110,0.08)] backdrop-blur-xl">
      <div className="mx-auto flex min-w-max max-w-7xl items-center gap-3 px-6 py-3">
        <nav className="flex shrink-0 items-center gap-2">
          {navItems
            .filter((item) => visibleNavKeys.includes(item.key))
            .map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-900"
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {simulatedNow && (
            <div className="relative shrink-0">
              <label className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950 shadow-sm">
                <span className="font-medium">Simulation</span>

                <input
                  type="datetime-local"
                  value={formatDateTimeLocalValue(simulatedNow)}
                  onChange={(event) =>
                    updateSimulatedDate(event.target.value)
                  }
                  className="rounded border border-emerald-200 bg-white px-2 py-1 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              {simulatedDateError && (
                <p className="absolute left-3 top-full mt-1 whitespace-nowrap text-xs text-red-600">
                  {simulatedDateError}
                </p>
              )}
            </div>
          )}

          {userName && (
            <div className="relative shrink-0">
              <label className="flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm text-sky-950 shadow-sm">
                <span className="font-medium">Fuseau</span>

                <select
                  value={timeZone}
                  onChange={(event) =>
                    updateTimeZone(event.target.value)
                  }
                  className="max-w-[190px] rounded border border-sky-200 bg-white px-2 py-1 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
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
          )}

          {userName && (
            <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
              >
                Déconnexion
              </button>

              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                {userName}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}