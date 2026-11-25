"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ScoreReportRow } from "./leaderboard-data";
import { formatOneDecimal } from "./format";

// Infobulle ancree a un bouton (position "fixed" bornee au viewport), ouverte
// au survol a la souris ou par appui sur mobile, fermee par un nouvel appui ou
// un appui en dehors.
export function useAnchoredTooltip(preferredMaxWidth: number, minWidth: number) {
  const [isOpen, setIsOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const anchorRef = useRef<HTMLLabelElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointerTypeRef = useRef<string>("mouse");

  useLayoutEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;

      if (!anchor || typeof window === "undefined") return;

      const anchorRect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 12;
      const gap = 4;
      const width = Math.min(
        viewportWidth - margin * 2,
        Math.max(minWidth, preferredMaxWidth)
      );
      const left = Math.max(
        margin,
        Math.min(viewportWidth - width - margin, anchorRect.left)
      );

      // Colle juste sous le bouton ; au-dessus uniquement s'il n'y a presque
      // pas de place en dessous (la hauteur est alors bornee, avec defilement).
      const spaceBelow = viewportHeight - anchorRect.bottom - gap - margin;
      const spaceAbove = anchorRect.top - gap - margin;
      const placeAbove = spaceBelow < 200 && spaceAbove > spaceBelow;

      setStyle(
        placeAbove
          ? {
              position: "fixed",
              bottom: viewportHeight - anchorRect.top + gap,
              left,
              width,
              maxHeight: Math.max(120, spaceAbove),
              overflowY: "auto",
              overflowX: "auto",
            }
          : {
              position: "fixed",
              top: anchorRect.bottom + gap,
              left,
              width,
              maxHeight: Math.max(120, spaceBelow),
              overflowY: "auto",
              overflowX: "auto",
            }
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, minWidth, preferredMaxWidth]);

  useEffect(() => {
    if (!isOpen) setStyle({});
  }, [isOpen]);

  // Tactile : un appui en dehors du bouton / de l'infobulle la ferme.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      const target = event.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return { isOpen, setIsOpen, style, anchorRef, tooltipRef, pointerTypeRef };
}

// Affiche l'infobulle dans <body> (portail) : une position "fixed" rendue a
// l'interieur d'un parent avec transform / filter / backdrop-blur serait
// decalee par rapport au bouton.
export function TooltipPortal({
  tooltip,
  children,
}: {
  tooltip: ReturnType<typeof useAnchoredTooltip>;
  children: ReactNode;
}) {
  if (!tooltip.isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={tooltip.tooltipRef}
      style={tooltip.style}
      className="z-50 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.10)]"
    >
      {children}
    </div>,
    document.body
  );
}

export type JourneeRankingData = {
  journees: string[];
  players: {
    userId: string;
    nickname: string;
    total: number;
    cells: { points: number; rank: number }[];
  }[];
};

// Pour chaque joueur et chaque journee du 1er tour (J1..J8, JB) : points de
// la journee et rang (1 = meilleur, ex aequo = meme rang), a partir des
// lignes de match du rapport de points. Joueurs tries par total des journees.
export function computeJourneeRanking(
  rows: { user_id: string; nickname?: string | null }[],
  scoreReportByUser: Record<string, ScoreReportRow[]>
): JourneeRankingData {
  const journeeOrder = (j: string) => (j === "JB" ? 100 : Number(j.slice(1)));
  const round2 = (value: number) => Math.round(value * 100) / 100;

  const pointsByUser = new Map<string, Map<string, number>>();
  const journeeSet = new Set<string>();

  for (const row of rows) {
    const perJournee = new Map<string, number>();
    for (const item of scoreReportByUser[row.user_id] ?? []) {
      if (item.kind !== "match" || !item.journee) continue;
      journeeSet.add(item.journee);
      perJournee.set(
        item.journee,
        (perJournee.get(item.journee) ?? 0) + item.points
      );
    }
    pointsByUser.set(row.user_id, perJournee);
  }

  const journees = Array.from(journeeSet).sort(
    (a, b) => journeeOrder(a) - journeeOrder(b)
  );

  const players = rows.map((row) => {
    const cells = journees.map((journee) => {
      const points = round2(pointsByUser.get(row.user_id)?.get(journee) ?? 0);
      const rank =
        1 +
        rows.filter(
          (other) =>
            round2(pointsByUser.get(other.user_id)?.get(journee) ?? 0) > points
        ).length;
      return { points, rank };
    });
    return {
      userId: row.user_id,
      nickname: row.nickname || "Joueur",
      total: cells.reduce((sum, cell) => sum + cell.points, 0),
      cells,
    };
  });

  players.sort((a, b) => b.total - a.total);

  return { journees, players };
}

export function JourneeRankingTable({ data }: { data: JourneeRankingData }) {
  if (data.journees.length === 0) {
    return (
      <p className="text-slate-500">Aucun point attribue pour le moment.</p>
    );
  }

  return (
    <table className="w-full border-collapse text-center">
      <thead>
        <tr>
          <th className="pb-1 pr-2 text-left text-[10px] font-medium text-slate-400">
            Joueur
          </th>
          {data.journees.map((journee) => (
            <th
              key={journee}
              className="px-1 pb-1 text-[10px] font-semibold uppercase text-slate-500"
            >
              {journee}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.players.map((player) => (
          <tr key={player.userId} className="border-t border-slate-100">
            <td className="max-w-[90px] truncate py-1 pr-2 text-left text-[11px] font-medium text-slate-900">
              {player.nickname}
            </td>
            {player.cells.map((cell, cellIndex) => (
              <td key={data.journees[cellIndex]} className="px-1 py-1 leading-tight">
                <div
                  className={`text-xs font-bold ${
                    cell.rank === 1 ? "text-emerald-600" : "text-slate-900"
                  }`}
                >
                  {cell.rank}
                </div>
                <div className="text-[9px] text-slate-400">
                  {formatOneDecimal(cell.points)}
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
