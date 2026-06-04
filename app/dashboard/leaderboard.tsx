"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { LeaderboardPayload, PhaseDetailRow, ScoreBreakdown } from "./leaderboard-data";
import { formatOneDecimal } from "./format";

const STORAGE_KEY = "activeGroupId";

type LeaderboardRow = LeaderboardPayload["rows"][number];

type LeaderboardRowItemProps = {
  row: LeaderboardRow;
  index: number;
  details?: ScoreBreakdown;
  phaseDetails?: PhaseDetailRow[];
};

function getScoreBreakdownLabel(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("group")) return "Groupes";
  if (
    normalizedPhase.includes("reel") ||
    normalizedPhase.includes("réel") ||
    normalizedPhase.includes("real")
  ) {
    return "Pronostics réel";
  }

  return "Tours éliminatoires";
}

function createEmptyBreakdown(): ScoreBreakdown {
  return { group: 0, knockout: 0, real: 0 };
}

function getBreakdownForUser(rows: PhaseDetailRow[]) {
  return rows.reduce<ScoreBreakdown>((acc, row) => {
    const label = getScoreBreakdownLabel(row.phase);

    if (label === "Groupes") {
      acc.group += row.points;
    } else if (label === "Tours éliminatoires") {
      acc.knockout += row.points;
    } else {
      acc.real += row.points;
    }

    return acc;
  }, createEmptyBreakdown());
}

function getRankBadgeClass(index: number) {
  if (index === 0) return "border-slate-300 bg-slate-100 text-slate-900";
  if (index === 1) return "border-slate-200 bg-white text-slate-700";
  if (index === 2) return "border-slate-200 bg-slate-50 text-slate-700";

  return "border-slate-200 bg-white text-slate-600";
}

function LeaderboardRowItem({
  row,
  index,
  details,
  phaseDetails,
}: LeaderboardRowItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({});
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isHovered) return;

    const updateTooltipPosition = () => {
      const anchor = anchorRef.current;
      const tooltip = tooltipRef.current;

      if (!anchor || !tooltip || typeof window === "undefined") return;

      const anchorRect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const preferredWidth = Math.min(360, viewportWidth - margin * 2);
      const tooltipWidth = Math.max(280, preferredWidth);
      const maxTooltipHeight = Math.max(160, viewportHeight - margin * 2);
      const tooltipHeight = Math.min(tooltip.offsetHeight || 180, maxTooltipHeight);

      const spaceBelow = viewportHeight - anchorRect.bottom - margin;
      const spaceAbove = anchorRect.top - margin;
      const placeAbove = spaceBelow < tooltipHeight && spaceAbove >= tooltipHeight;

      const top = placeAbove
        ? Math.max(margin, anchorRect.top - tooltipHeight - margin)
        : Math.min(viewportHeight - tooltipHeight - margin, anchorRect.bottom + margin);

      const left = Math.min(
        Math.max(margin, anchorRect.left),
        Math.max(margin, viewportWidth - tooltipWidth - margin)
      );

      setTooltipStyle({
        position: "fixed",
        top,
        left,
        width: tooltipWidth,
        maxHeight: maxTooltipHeight,
        overflowY: "auto",
      });
    };

    updateTooltipPosition();
    window.addEventListener("resize", updateTooltipPosition);
    window.addEventListener("scroll", updateTooltipPosition, true);

    return () => {
      window.removeEventListener("resize", updateTooltipPosition);
      window.removeEventListener("scroll", updateTooltipPosition, true);
    };
  }, [isHovered, details, phaseDetails]);

  useEffect(() => {
    if (!isHovered) {
      setTooltipStyle({});
    }
  }, [isHovered]);

  return (
    <div
      className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 min-w-0 transition hover:bg-slate-50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="relative inline-flex min-w-0 items-center gap-2">
        <span
          className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${getRankBadgeClass(index)}`}
        >
          #{index + 1}
        </span>

        <span
          ref={anchorRef}
          className="truncate text-sm font-medium text-slate-900 min-w-0 cursor-help"
        >
          {row.nickname}
        </span>

        {isHovered ? (
          <div
            ref={tooltipRef}
            style={tooltipStyle}
            className="z-50 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Détail des points de <span className="text-slate-900">{row.nickname}</span>
            </p>

            {details ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Groupes</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(details.group)} pts</strong>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                  <span className="text-slate-600">Tours éliminatoires</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(details.knockout)} pts</strong>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-slate-600">Pronostics réel</span>
                  <strong className="text-sm text-slate-900">{formatOneDecimal(details.real)} pts</strong>
                </div>
              </div>
            ) : (
              <p className="text-slate-500">Aucun détail disponible.</p>
            )}

            {phaseDetails?.length ? (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Base par étape
                </p>
                <div className="space-y-1.5">
                  {phaseDetails.map((phaseRow) => (
                    <div
                      key={phaseRow.phase}
                      className="flex items-center justify-between gap-4 text-slate-600"
                    >
                      <span className="truncate pr-2">{phaseRow.phase}</span>
                      <strong className="shrink-0 text-slate-900">
                        base {formatOneDecimal(phaseRow.base)} - {formatOneDecimal(phaseRow.points)} pts
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </span>

      <strong className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm text-white">
        {formatOneDecimal(row.points)} pts
      </strong>
    </div>
  );
}

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [detailsByUser, setDetailsByUser] = useState<Record<string, ScoreBreakdown>>({});
  const [phaseDetailsByUser, setPhaseDetailsByUser] = useState<Record<string, PhaseDetailRow[]>>({});
  const [message, setMessage] = useState("Chargement...");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(STORAGE_KEY);
  });
  const router = useRouter();

  useEffect(() => {
    const handleActiveGroupUpdated = () => {
      setActiveGroupId(window.localStorage.getItem(STORAGE_KEY));
    };

    window.addEventListener("active-group-updated", handleActiveGroupUpdated);
    return () => window.removeEventListener("active-group-updated", handleActiveGroupUpdated);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setMessage("Chargement...");

        const response = await fetch(
          `/api/leaderboard${activeGroupId ? `?groupId=${encodeURIComponent(activeGroupId)}` : ""}`,
          {
            cache: "no-store",
          }
        );

        if (cancelled) return;

        const payload = (await response.json()) as LeaderboardPayload & { error?: string };

        if (!response.ok) {
          const errorMessage = payload.error ?? "Erreur chargement classement.";
          setMessage(errorMessage);
          return;
        }

        setRows(payload.rows);
        setDetailsByUser(payload.detailsByUser);
        setPhaseDetailsByUser(payload.phaseDetailsByUser);
        setMessage(payload.message);
      } catch (error) {
        console.error("Erreur leaderboard:", error);
        setMessage(
          error instanceof Error
            ? error.message
            : "Erreur chargement classement."
        );
      }
    }

    void loadLeaderboard();

    const channel = supabase
      .channel("leaderboard-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "predictions",
        },
        () => {
          void loadLeaderboard();
          router.refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
        },
        () => {
          void loadLeaderboard();
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeGroupId]);

  return (
    <section className="w-full">
      {message ? (
        <p className="rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {message}
        </p>
      ) : (
        <div className="relative w-full overflow-visible rounded-lg border border-emerald-200 bg-white shadow-[0_18px_45px_rgba(15,118,110,0.10)]">
          <div className="flex items-center justify-between gap-3 rounded-t-lg border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-slate-900">
            <span>Classement live</span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900">
              Live
            </span>
          </div>

          <div className="overflow-visible divide-y divide-slate-100">
            {rows.map((row, index) => (
              <LeaderboardRowItem
                key={row.user_id}
                row={row}
                index={index}
                details={detailsByUser[row.user_id]}
                phaseDetails={phaseDetailsByUser[row.user_id]}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}