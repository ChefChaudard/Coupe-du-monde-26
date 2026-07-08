"use client";

import { useMemo, useState } from "react";
import { topScorerCandidates } from "./top-scorer-candidates";

type TopScorerMultiSelectProps = {
  /** Nom du champ soumis dans le FormData (une entrée par joueur sélectionné). */
  name: string;
  /** Joueurs déjà retenus comme meilleurs buteurs réels. */
  defaultSelected?: string[];
  disabled?: boolean;
  className?: string;
};

const BOX_CLASS =
  "h-72 w-full rounded-2xl border border-slate-200 bg-slate-50 p-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#7a1f2c] focus:bg-white focus:ring-4 focus:ring-[#7a1f2c]/10 disabled:opacity-60";

const BUTTON_CLASS =
  "w-full rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

export default function TopScorerMultiSelect({
  name,
  defaultSelected = [],
  disabled,
  className,
}: TopScorerMultiSelectProps) {
  const [selected, setSelected] = useState<string[]>(() =>
    defaultSelected.filter((player) => (topScorerCandidates as readonly string[]).includes(player))
  );
  const [leftHighlighted, setLeftHighlighted] = useState<string[]>([]);
  const [rightHighlighted, setRightHighlighted] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const available = useMemo(() => {
    const base = (topScorerCandidates as readonly string[])
      .filter((player) => !selected.includes(player))
      .slice()
      .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return base;

    return base.filter((player) => player.toLowerCase().includes(normalizedSearch));
  }, [selected, searchTerm]);

  const selectedSorted = useMemo(
    () =>
      selected.slice().sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    [selected]
  );

  function moveToSelected(players: string[]) {
    if (players.length === 0) return;
    setSelected((current) => Array.from(new Set([...current, ...players])));
    setLeftHighlighted([]);
  }

  function moveToAvailable(players: string[]) {
    if (players.length === 0) return;
    setSelected((current) => current.filter((player) => !players.includes(player)));
    setRightHighlighted([]);
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">Joueurs possibles</span>
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            disabled={disabled}
            placeholder="Rechercher un joueur..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#7a1f2c] focus:ring-4 focus:ring-[#7a1f2c]/10 disabled:opacity-60"
          />
          <select
            multiple
            disabled={disabled}
            className={BOX_CLASS}
            value={leftHighlighted}
            onChange={(event) =>
              setLeftHighlighted(Array.from(event.target.selectedOptions, (option) => option.value))
            }
          >
            {available.map((player) => (
              <option key={player} value={player} onDoubleClick={() => moveToSelected([player])}>
                {player}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-row gap-2 sm:flex-col">
          <button
            type="button"
            disabled={disabled || leftHighlighted.length === 0}
            onClick={() => moveToSelected(leftHighlighted)}
            className={BUTTON_CLASS}
            aria-label="Ajouter aux meilleurs buteurs"
          >
            &gt;
          </button>
          <button
            type="button"
            disabled={disabled || available.length === 0}
            onClick={() => moveToSelected(available)}
            className={BUTTON_CLASS}
            aria-label="Ajouter tous les joueurs"
          >
            &gt;&gt;
          </button>
          <button
            type="button"
            disabled={disabled || rightHighlighted.length === 0}
            onClick={() => moveToAvailable(rightHighlighted)}
            className={BUTTON_CLASS}
            aria-label="Retirer des meilleurs buteurs"
          >
            &lt;
          </button>
          <button
            type="button"
            disabled={disabled || selected.length === 0}
            onClick={() => moveToAvailable(selected)}
            className={BUTTON_CLASS}
            aria-label="Retirer tous les joueurs"
          >
            &lt;&lt;
          </button>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-semibold text-slate-700">
            Meilleurs buteurs {selected.length > 0 ? `(${selected.length})` : ""}
          </span>
          <select
            multiple
            disabled={disabled}
            className={BOX_CLASS}
            value={rightHighlighted}
            onChange={(event) =>
              setRightHighlighted(Array.from(event.target.selectedOptions, (option) => option.value))
            }
          >
            {selectedSorted.map((player) => (
              <option key={player} value={player} onDoubleClick={() => moveToAvailable([player])}>
                {player}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Double-clique sur un joueur pour le déplacer, ou utilise les flèches. En cas d'ex-aequo,
        sélectionne tous les joueurs concernés dans la colonne de droite.
      </p>

      {selected.map((player) => (
        <input key={player} type="hidden" name={name} value={player} />
      ))}
    </div>
  );
}
