"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_TIME_ZONE,
  getSafeTimeZone,
  USER_TIME_ZONE_UPDATED_EVENT,
} from "@/app/lib/time-zone";

type CurrentUserResponse = {
  user: {
    timeZone?: string | null;
  } | null;
};

export function useUserTimeZone() {
  const [timeZone, setTimeZone] = useState(DEFAULT_TIME_ZONE);

  useEffect(() => {
    let isMounted = true;

    async function loadTimeZone() {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) return;

      const payload = (await response.json()) as CurrentUserResponse;
      const nextTimeZone = getSafeTimeZone(payload.user?.timeZone);

      if (isMounted) setTimeZone(nextTimeZone);
    }

    function handleTimeZoneUpdated(event: Event) {
      const nextTimeZone = (event as CustomEvent<string>).detail;
      setTimeZone(getSafeTimeZone(nextTimeZone));
    }

    window.addEventListener(
      USER_TIME_ZONE_UPDATED_EVENT,
      handleTimeZoneUpdated
    );
    void loadTimeZone();

    return () => {
      isMounted = false;
      window.removeEventListener(
        USER_TIME_ZONE_UPDATED_EVENT,
        handleTimeZoneUpdated
      );
    };
  }, []);

  return timeZone;
}
