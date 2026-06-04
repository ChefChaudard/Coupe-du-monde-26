"use client";

import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase/client";

const STORAGE_KEY = "activeGroupId";

type MatchRow = {
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean;
  phase: string;
};

type Prediction = {
  user_id: string;
  predicted_a: number;
  predicted_b: number;
  matches: MatchRow | MatchRow[] | null;
};

type Profile = {
  id: string;
  nickname: string;
};

type PhaseScoreRow = {
  user_id: string;
  phase: string;
  points: number;
};

type ScoreBreakdown = {
  group: number;
  knockout: number;
  real: number;
};

type PhaseDetailRow = {
  phase: string;
  points: number;
  base: number;
};

type LeaderboardRow = {
  user_id: string;
  nickname: string;
  points: number;
};

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

function getPhaseBase(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("group")) return 1;
  if (normalizedPhase.includes("32e")) return 1;
  if (
    normalizedPhase.includes("16e") ||
    normalizedPhase.includes("8e") ||
    normalizedPhase.includes("quart")
  ) {
    return 2;
  }
  if (normalizedPhase.includes("demi") || normalizedPhase.includes("finale")) {
    return 3;
  }
  if (normalizedPhase.includes("vainqueur")) return 4;

  return 1;
}

function createEmptyBreakdown(): ScoreBreakdown {
  return { group: 0, knockout: 0, real: 0 };
}

function getBreakdownForUser(rows: PhaseScoreRow[]) {
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

function getPhaseDetails(rows: PhaseScoreRow[]) {
  return rows
    .map((row) => ({
      phase: row.phase,
      points: row.points,
      base: getPhaseBase(row.phase),
    }))
    .sort((a, b) => {
      const order = [
        "group",
        "32e",
        "16e",
        "8e",
        "quart",
        "demi",
        "finale",
        "vainqueur",
        "reel",
        "real",
      ];

      const aIndex = order.findIndex((token) => a.phase.toLowerCase().includes(token));
      const bIndex = order.findIndex((token) => b.phase.toLowerCase().includes(token));

      if (aIndex !== bIndex) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }

      return a.phase.localeCompare(b.phase);
    });
}

function getPoints(p: Prediction) {
  const m = Array.isArray(p.matches) ? p.matches[0] : p.matches;

  if (!m || !m.is_finished || m.score_a === null || m.score_b === null) {
    return 0;
  }

  const normalizedPhase = m.phase.toLowerCase();
  const base = normalizedPhase.includes("group")
    ? 1
    : normalizedPhase.includes("16e") ||
        normalizedPhase.includes("8e") ||
        normalizedPhase.includes("quart")
      ? 2
      : normalizedPhase.includes("demi") || normalizedPhase.includes("finale")
        ? 3
        : 1;

  if (p.predicted_a === m.score_a && p.predicted_b === m.score_b) {
    return 3 * base;
  }

  const realDiff = m.score_a - m.score_b;
  const predDiff = p.predicted_a - p.predicted_b;

  const goodResult =
    (realDiff > 0 && predDiff > 0) ||
    (realDiff < 0 && predDiff < 0) ||
    (realDiff === 0 && predDiff === 0);

  return goodResult ? base : 0;
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

        <div
          ref={tooltipRef}
          style={tooltipStyle}
          className={`z-50 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.10)] transition duration-150 ${
            isHovered ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Détail des points
          </p>

          {details ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                <span className="text-slate-600">Groupes</span>
                <strong className="text-sm text-slate-900">{details.group} pts</strong>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                <span className="text-slate-600">Tours éliminatoires</span>
                <strong className="text-sm text-slate-900">{details.knockout} pts</strong>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-slate-600">Pronostics réel</span>
                <strong className="text-sm text-slate-900">{details.real} pts</strong>
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
                      base {phaseRow.base} - {phaseRow.points} pts
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </span>

      <strong className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm text-white">
        {row.points} pts
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

        let groupMemberIds = new Set<string>();

        if (activeGroupId) {
          const { data: memberships, error: membershipError } = await supabase
            .from("group_members")
            .select("user_id")
            .eq("group_id", activeGroupId);

          if (!membershipError && memberships) {
            groupMemberIds = new Set(
              (memberships as { user_id: string }[]).map((row) => row.user_id)
            );
          }
        }

        const { data: predictions, error: predictionsError } = await supabase
          .from("predictions")
          .select(`
            user_id,
            predicted_a,
            predicted_b,
            matches (
              phase,
              score_a,
              score_b,
              is_finished
            )
          `);

        if (cancelled) return;

        if (predictionsError) {
          console.error(predictionsError);
          setMessage(`Erreur pronostics : ${predictionsError.message}`);
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, nickname");

        if (cancelled) return;

        if (profilesError) {
          console.error(profilesError);
          setMessage(`Erreur profils : ${profilesError.message}`);
          return;
        }

        const { data: phaseScores, error: phaseScoresError } = await supabase
          .from("phase_leaderboard")
          .select("user_id, phase, points");

        if (cancelled) return;

        if (phaseScoresError) {
          console.error(phaseScoresError);
          setMessage(`Erreur détails points : ${phaseScoresError.message}`);
          return;
        }

        const profileMap = new Map(
          (profiles ?? []).map((profile: Profile) => [
            profile.id,
            profile.nickname,
          ])
        );

        const breakdownMap = new Map<string, PhaseScoreRow[]>();
        for (const row of (phaseScores ?? []) as PhaseScoreRow[]) {
          const current = breakdownMap.get(row.user_id) ?? [];
          current.push(row);
          breakdownMap.set(row.user_id, current);
        }

        const scoreMap = new Map<string, number>();
        const filteredPredictions = (predictions ?? []) as unknown as Prediction[];
        const isGroupFilterActive = activeGroupId !== null;

        filteredPredictions
          .filter((prediction) =>
            isGroupFilterActive
              ? groupMemberIds.has(prediction.user_id)
              : true
          )
          .forEach((prediction) => {
            const current = scoreMap.get(prediction.user_id) ?? 0;
            scoreMap.set(prediction.user_id, current + getPoints(prediction));
          });

        const leaderboard = Array.from(scoreMap.entries())
          .map(([user_id, points]) => ({
            user_id,
            points,
            nickname: profileMap.get(user_id) ?? "Inconnu",
          }))
          .sort((a, b) => b.points - a.points);

        const nextDetailsByUser: Record<string, ScoreBreakdown> = {};
        const nextPhaseDetailsByUser: Record<string, PhaseDetailRow[]> = {};

        for (const [userId, phaseRows] of breakdownMap.entries()) {
          nextDetailsByUser[userId] = getBreakdownForUser(phaseRows);
          nextPhaseDetailsByUser[userId] = getPhaseDetails(phaseRows);
        }

        setRows(leaderboard);
        setDetailsByUser(nextDetailsByUser);
        setPhaseDetailsByUser(nextPhaseDetailsByUser);
        setMessage(leaderboard.length ? "" : "Aucun score pour le moment.");
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

    return () => {
      cancelled = true;
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