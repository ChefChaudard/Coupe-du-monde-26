"use client";

import { formatMatchDate, formatMatchTime } from "@/app/lib/time-zone";
import { useUserTimeZone } from "@/app/lib/use-user-time-zone";

export default function Round32SlotSchedule({
  city,
  kickoffAt,
}: {
  city: string;
  kickoffAt: string;
}) {
  const timeZone = useUserTimeZone();
  const date = kickoffAt ? new Date(kickoffAt) : null;

  return (
    <p className="mt-1 text-sm text-slate-500" suppressHydrationWarning>
      {city}
      {date ? ` · ${formatMatchDate(date, timeZone)}, ${formatMatchTime(date, timeZone)}` : ""}
    </p>
  );
}
