"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ROLE_ADMIN, ROLE_SUPER_ADMIN } from "@/lib/roles";
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
    { key: "mobileT1", label: "1er Tour", href: "/groupes/mobile" },
    { key: "knockout", label: "Classement Equipes", href: "/knockout" },
      { key: "qualifies", label: "Qualifiés", href: "/knockout/qualifies" },
      { key: "realKnockout", label: "2eme Tour Réel", href: "/knockout/mobile" },
       { key: "mobileClassement", label: "Classement Joueurs", href: "/classement/mobile" },
  { key: "reglement", label: "Reglement CL 26-27", href: "/reglement" },
  { key: "quote", label: "Quote", href: "" },
];

const SIMULATED_DATE_STORAGE_KEY = "simulated-date";

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
  const [simulatedInput, setSimulatedInput] = useState<string>("");
  const [simulatedDateError, setSimulatedDateError] = useState("");
  const [savingGroups, setSavingGroups] = useState(false);
  const [syncingOdds, setSyncingOdds] = useState(false);
  const [canSyncOdds, setCanSyncOdds] = useState(false);

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
        setCanSyncOdds(false);
        setUserName(null);
        setTimeZone(getStoredTimeZone() ?? DEFAULT_TIME_ZONE);
        return;
      }

      setIsAuthenticated(true);
      setIsSuperAdmin(
        apiUser.roles?.includes(ROLE_SUPER_ADMIN) ?? false
      );
      setCanSyncOdds(
        (apiUser.roles?.includes(ROLE_SUPER_ADMIN) ||
          apiUser.roles?.includes(ROLE_ADMIN)) ??
          false
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
        setCanSyncOdds(false);
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
      const resetTimer = window.setTimeout(() => {
        setSimulatedNow(null);
        setSimulatedInput("");
        setSimulatedDateError("");
      }, 0);

      return () => {
        window.clearTimeout(resetTimer);
      };
    }

    async function loadSimulatedDate() {
      const storedValue = readStoredSimulatedDate();

      if (storedValue) {
        setSimulatedNow(storedValue);
        setSimulatedInput(formatDateTimeLocalValue(storedValue));
      }

      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "simulated_date")
        .maybeSingle();

      if (data?.value) {
        setSimulatedNow(data.value);
        setSimulatedInput(formatDateTimeLocalValue(data.value));
      } else if (!storedValue) {
        setSimulatedNow(storedValue);
        setSimulatedInput(storedValue ? formatDateTimeLocalValue(storedValue) : "");
      }
    }

    void loadSimulatedDate();
  }, [isSuperAdmin]);


  async function updateSimulatedDate(value: string) {
    if (!value) {
      return;
    }

    setSimulatedInput(value);

    const nextDate = new Date(value);

    if (Number.isNaN(nextDate.getTime())) return;

    const nextValue = nextDate.toISOString();
    const previousValue = simulatedNow;
    const previousInput = simulatedInput;

    setSimulatedDateError("");
    setSimulatedNow(nextValue);
    setSimulatedInput(value);
    writeStoredSimulatedDate(nextValue);

    window.dispatchEvent(
      new CustomEvent("simulated-date-updated", {
        detail: nextValue,
      })
    );

    const { error } = await supabase
      .from("app_settings")
      .upsert({
        key: "simulated_date",
        value: nextValue,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" })
      ;

    if (error) {
      setSimulatedDateError(
        error?.message ??
          "Date simulée introuvable dans les réglages."
      );

      return;
    }
  }

  async function clearSimulatedDate() {
    const previousValue = simulatedNow;
    const previousInput = simulatedInput;

    setSimulatedDateError("");
    setSimulatedNow(null);
    setSimulatedInput("");
    writeStoredSimulatedDate(null);

    window.dispatchEvent(
      new CustomEvent("simulated-date-updated", {
        detail: "",
      })
    );

    const { error } = await supabase
      .from("app_settings")
      .delete()
      .eq("key", "simulated_date");

    if (error) {
      setSimulatedDateError(error.message);
      return;
    }
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
    if (pathname.startsWith("/account/")) return "account";
    if (pathname === "/knockout") return "knockout";
    if (pathname === "/real-knockout") return "realKnockout";
    if (pathname.startsWith("/admin/groups")) return "adminGroups";
    if (pathname === "/groupes/mobile") return "mobileT1";
       if (pathname === "/classement/mobile") return "mobileClassement";
    if (pathname === "/reglement") return "reglement";

    if (pathname === "/dashboard") {
      const tab = searchParams.get("tab");

      return tab === "tours" ? "tours" : "groupes";
    }

    return null;
  }, [pathname, searchParams]);

    const visibleNavKeys = useMemo(
    () => navItems.map((item) => item.key),
    []
  );

  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function updateTopbarHeight() {
      if (headerRef.current) {
        document.documentElement.style.setProperty(
          "--topbar-height",
          `${headerRef.current.getBoundingClientRect().height}px`
        );
      }
    }

    updateTopbarHeight();
    window.addEventListener("resize", updateTopbarHeight);
    return () => window.removeEventListener("resize", updateTopbarHeight);
  }, []);

  const showSaveGroupsButton = currentKey === "groupes";

  async function handleSaveGroups() {
    if (savingGroups) return;

    setSavingGroups(true);

    try {
      window.dispatchEvent(new CustomEvent("save-all-group-predictions"));
    } finally {
      setSavingGroups(false);
    }
  }
  async function handleSyncOdds() {
    if (syncingOdds) return;

    setSyncingOdds(true);

    try {
      const response = await fetch("/api/admin/sync-odds", { method: "POST" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        window.alert(payload.error ?? "Erreur lors de la synchronisation des cotes.");
        return;
      }

      window.alert(
        `Cotes mises à jour : ${payload.updated} match(s) sur ${payload.totalEvents} trouvé(s).`
      );
    } catch (error) {
      console.error("Erreur handleSyncOdds:", error);
      window.alert("Erreur lors de la synchronisation des cotes.");
    } finally {
      setSyncingOdds(false);
    }
  }
  if (pathname === "/") {
    return (
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="relative mx-auto flex w-full max-w-[1600px] items-center px-4 py-2 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px]">
            <span className="font-bold text-slate-950">Pronos 7eme</span>
            {userName && (
              <span className="font-medium text-slate-500"> ({userName})</span>
            )}
          </div>

          {!userName && (
            <Link
              href="/login"
              className="ml-auto shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:px-4 sm:py-2 sm:text-sm"
            >
              Se connecter
            </Link>
          )}
        </div>
      </header>
    );
  }
if (
    pathname === "/admin/users" ||
    pathname === "/admin/groups" ||
    pathname === "/admin/real-knockout"
  ) {
    return (
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1600px] flex-nowrap items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
          <nav className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/"
              className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 sm:px-3 sm:text-sm"
            >
              Accueil
            </Link>

            <Link
              href="/administration"
              className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 sm:px-3 sm:text-sm"
            >
              Accueil Administration
            </Link>
          </nav>
        </div>
      </header>
    );
  }
  return (
    <>
       <header ref={headerRef} className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-nowrap items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
<Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="leading-tight">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Pronos
            </span>
<span className="block text-[13px] font-semibold text-slate-900">
  {userName ?? "Coupe du Monde 2026"}
</span>
          </span>
        </Link>

         <nav className="flex shrink-0 items-center gap-1.5 lg:ml-3">
          {navItems
            .filter((item) =>
              item.key === "quote" ? canSyncOdds : visibleNavKeys.includes(item.key)
            )
            .map((item) =>
              item.key === "quote" ? (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => void handleSyncOdds()}
                  disabled={syncingOdds}
                  className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:text-sm"
                >
                  {syncingOdds ? "Synchro..." : item.label}
                </button>
              ) : (
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
              )
            )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-2.5">
          {showSaveGroupsButton ? (
            <button
              type="button"
              onClick={() => void handleSaveGroups()}
              disabled={savingGroups}
              className="whitespace-nowrap rounded-full bg-[#7a1f2c] px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-[#5f1822] disabled:cursor-not-allowed disabled:opacity-60 sm:px-3 sm:text-sm"
            >
              {savingGroups ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          ) : null}

{!userName && (
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
    </>
  );
}

function readStoredSimulatedDate() {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(SIMULATED_DATE_STORAGE_KEY) || null;
}

function writeStoredSimulatedDate(value: string | null) {
  if (typeof window === "undefined") return;

  if (value) {
    window.localStorage.setItem(SIMULATED_DATE_STORAGE_KEY, value);
  } else {
    window.localStorage.removeItem(SIMULATED_DATE_STORAGE_KEY);
  }
}
