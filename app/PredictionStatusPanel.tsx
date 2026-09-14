"use client";

import { useState } from "react";
import type { PredictionStatusPayload } from "./prediction-status";

export default function PredictionStatusPanel({
  data,
}: {
  data: PredictionStatusPayload;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activePartKey, setActivePartKey] = useState(
    data.parts[0]?.key ?? ""
  );

  const activePart = data.parts.find((part) => part.key === activePartKey);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
      >
        Suivi des saisies {isOpen ? "▲" : "▼"}
      </button>

      {isOpen ? (
        <div className="mt-4 w-full basis-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Choisir une partie
          </p>

          <div className="flex flex-wrap gap-2">
            {data.parts.map((part) => (
              <button
                key={part.key}
                type="button"
                onClick={() => setActivePartKey(part.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  activePartKey === part.key
                    ? "bg-[#7a1f2c] text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {part.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {!activePart || activePart.total === 0 ? (
              <p className="text-sm text-slate-500">
                Aucun match programme pour cette partie pour le moment.
              </p>
            ) : (
              data.rows.map((row) => {
                const pct = row.percentagesByPart[activePartKey] ?? null;

                return (
                  <div
                    key={row.nickname}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 text-sm last:border-b-0"
                  >
                    <span className="font-medium text-slate-900">
                      {row.nickname}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[#7a1f2c] transition-all"
                          style={{ width: `${pct ?? 0}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs font-semibold text-slate-600">
                        {pct === null ? "-" : `${pct}%`}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
