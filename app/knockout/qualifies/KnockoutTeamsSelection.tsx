"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

const TIERS = [
  { key: "huitiemes", groupName: "8emes de finale", label: "8emes", count: 16 },
  { key: "quarts", groupName: "Quarts de finale", label: "Quarts", count: 8 },
  { key: "demi", groupName: "Demi-finales", label: "Demi", count: 4 },
  { key: "finale", groupName: "Finale", label: "Finale", count: 2 },
  { key: "vainqueur", groupName: "Vainqueur", label: "Vainqueur", count: 1 },
];

export default function KnockoutTeamsSelection({
  userId,
  pool,
  initialSelectedByTier,
  locked = false,
}: {
  userId: string;
  pool: string[];
  initialSelectedByTier: Record<string, string[]>;
  locked?: boolean;
}) {
  const [selectedByTier, setSelectedByTier] = useState<Record<string, string[]>>(
    initialSelectedByTier
  );
  const [activeTierIndex, setActiveTierIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const activeTier = TIERS[activeTierIndex];
  const selectedTeams = selectedByTier[activeTier.key] ?? [];
  const availableTeams = pool.filter((team) => !selectedTeams.includes(team));

  function moveToSelected(team: string) {
    if (locked) return;
    if (selectedTeams.length >= activeTier.count) return;

    setSelectedByTier((prev) => ({
      ...prev,
      [activeTier.key]: [...(prev[activeTier.key] ?? []), team],
    }));
    setSaveMessage(null);
  }

  function moveToAvailable(team: string) {
    if (locked) return;

    setSelectedByTier((prev) => ({
      ...prev,
      [activeTier.key]: (prev[activeTier.key] ?? []).filter((t) => t !== team),
    }));
    setSaveMessage(null);
  }

  async function handleSave() {
    if (saving || locked) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      for (const tier of TIERS) {
        const selected = selectedByTier[tier.key] ?? [];
        const rest = pool.filter((team) => !selected.includes(team));
        const orderedTeams = [...selected, ...rest];

        if (orderedTeams.length === 0) continue;

        const finalRows = orderedTeams.map((team, index) => ({
          user_id: userId,
          group_name: tier.groupName,
          team_name: team,
          predicted_position: index + 1,
          updated_at: new Date().toISOString(),
        }));

        // Supprime toutes les lignes existantes pour ce tier avant de
        // reinserer : une simple upsert par team_name laissait des lignes
        // obsoletes (equipes qui ne font plus partie du pool actuel) sur
        // d'anciennes positions, qui entraient alors en collision avec la
        // contrainte unique (user_id, group_name, predicted_position) des
        // qu'une nouvelle equipe reclamait la meme position.
        const { error: deleteError } = await supabase
          .from("group_predictions")
          .delete()
          .eq("user_id", userId)
          .eq("group_name", tier.groupName);

        if (deleteError) {
          console.error(
            `Erreur suppression ${tier.groupName}:`,
            JSON.stringify(deleteError, null, 2)
          );
          setSaveMessage("Erreur lors de la sauvegarde.");
          setSaving(false);
          return;
        }

        const { error: insertError } = await supabase
          .from("group_predictions")
          .insert(finalRows);

        if (insertError) {
          console.error(
            `Erreur sauvegarde ${tier.groupName}:`,
            JSON.stringify(insertError, null, 2)
          );
          setSaveMessage("Erreur lors de la sauvegarde.");
          setSaving(false);
          return;
        }
      }

      setSaveMessage("Selections sauvegardees.");
    } finally {
      setSaving(false);
    }
    }

  return (
    <section className="space-y-4 text-slate-900">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Equipes qualifiees
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Choisissez {activeTier.count} equipe
            {activeTier.count > 1 ? "s" : ""} pour {activeTier.label.toLowerCase()}{" "}
            parmi les 36 equipes de la competition.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || locked}
          className="rounded bg-[#7a1f2c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:opacity-60"
        >
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </div>

      {locked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          La competition a debute : les selections sont verrouillees et ne
          peuvent plus etre modifiees.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TIERS.map((tier, index) => (
          <button
            key={tier.key}
            type="button"
            onClick={() => setActiveTierIndex(index)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              activeTierIndex === index
                ? "bg-[#7a1f2c] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {tier.label} ({(selectedByTier[tier.key] ?? []).length}/{tier.count})
          </button>
        ))}
      </div>

      {saveMessage && <p className="text-sm">{saveMessage}</p>}

      {pool.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm text-slate-500 shadow-sm">
          Aucune equipe disponible pour le moment.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
              Disponibles ({availableTeams.length})
            </div>
            <ul className="divide-y divide-slate-100">
              {availableTeams.map((team) => (
                <li
                  key={team}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="text-sm font-medium text-slate-900">
                    {team}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveToSelected(team)}
                    disabled={selectedTeams.length >= activeTier.count || locked}
                    aria-label={`Selectionner ${team}`}
                    className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    dangerouslySetInnerHTML={{ __html: "&rarr;" }}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
              {activeTier.label} ({selectedTeams.length}/{activeTier.count})
            </div>
            <ul className="divide-y divide-slate-100">
              {selectedTeams.map((team) => (
                <li
                  key={team}
                  className="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => moveToAvailable(team)}
                    disabled={locked}
                    aria-label={`Retirer ${team}`}
                    className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    dangerouslySetInnerHTML={{ __html: "&larr;" }}
                  />
                  <span className="flex-1 text-right text-sm font-medium text-slate-900">
                    {team}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
