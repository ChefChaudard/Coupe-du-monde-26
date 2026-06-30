"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_TIME_ZONE,
  formatTimeZoneLabel,
  getSafeTimeZone,
  getStoredTimeZone,
  getTimeZoneOptions,
  setStoredTimeZone,
  USER_TIME_ZONE_UPDATED_EVENT,
} from "@/app/lib/time-zone";

type ApiUser = {
  timeZone?: string | null;
};

async function fetchUserTimeZone(): Promise<{ isAuthenticated: boolean; timeZone: string | null }> {
  const response = await fetch("/api/me", { cache: "no-store" });

  if (!response.ok) return { isAuthenticated: false, timeZone: null };

  const payload = (await response.json()) as { user: ApiUser | null };

  return {
    isAuthenticated: !!payload.user,
    timeZone: payload.user?.timeZone ?? null,
  };
}

export default function TimeZoneSelector() {
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [timeZoneError, setTimeZoneError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const router = useRouter();
  const timeZoneOptions = useMemo(() => getTimeZoneOptions(), []);

  useEffect(() => {
    async function load() {
      const { isAuthenticated: auth, timeZone: tz } = await fetchUserTimeZone();
      setIsAuthenticated(auth);
      setTimeZone(getSafeTimeZone(tz || getStoredTimeZone()));
    }

    void load();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void load();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function updateTimeZone(nextTimeZone: string) {
    const previousTimeZone = timeZone;
    const safeTimeZone = getSafeTimeZone(nextTimeZone);

    setTimeZoneError("");
    setTimeZone(safeTimeZone);

    if (!isAuthenticated) {
      setStoredTimeZone(safeTimeZone);
      window.dispatchEvent(
        new CustomEvent(USER_TIME_ZONE_UPDATED_EVENT, { detail: safeTimeZone })
      );
      router.refresh();
      return;
    }

    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone: safeTimeZone }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setTimeZone(previousTimeZone);
      setTimeZoneError(payload.error ?? "Impossible de sauvegarder le fuseau horaire.");
      return;
    }

    window.dispatchEvent(
      new CustomEvent(USER_TIME_ZONE_UPDATED_EVENT, { detail: safeTimeZone })
    );
    setStoredTimeZone(safeTimeZone);
    router.refresh();
  }

  return (
    <div className="relative">
      <label className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50">
        <span className="font-semibold text-slate-500">Fuseau</span>
        <select
          value={timeZone}
          onChange={(e) => void updateTimeZone(e.target.value)}
          className="bg-transparent font-semibold text-slate-900 outline-none"
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
  );
}
