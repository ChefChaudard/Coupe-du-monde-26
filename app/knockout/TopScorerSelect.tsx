"use client";

import { formatOneDecimal } from "@/app/dashboard/format";
import { getTopScorerProbability, topScorerCandidates } from "./top-scorer-candidates";

type TopScorerSelectProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  showProbabilities?: boolean;
  placeholder?: string;
  className?: string;
};

const DEFAULT_CLASS_NAME =
  "w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100";

export default function TopScorerSelect({
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  showProbabilities = true,
  placeholder = "Sélectionner le meilleur buteur",
  className,
}: TopScorerSelectProps) {
  const controlledProps = onChange
    ? {
        value: value ?? "",
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange(event.target.value),
      }
    : { defaultValue: defaultValue ?? "" };

  return (
    <select
      name={name}
      disabled={disabled}
      className={className ?? DEFAULT_CLASS_NAME}
      {...controlledProps}
    >
      <option value="">{placeholder}</option>
      {topScorerCandidates.map((player, index) => {
        const probability = showProbabilities ? getTopScorerProbability(index) : null;

        return (
          <option key={player} value={player}>
            {probability !== null ? `${player} (${formatOneDecimal(probability)}%)` : player}
          </option>
        );
      })}
    </select>
  );
}
