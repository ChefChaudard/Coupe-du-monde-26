"use client";

type Props = {
  action: (formData: FormData) => Promise<void>;
};

export default function ResetGroupsForm({ action }: Props) {
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-4 rounded-2xl border border-amber-200 bg-white p-4"
      onSubmit={(event) => {
        if (!window.confirm("Réinitialiser tous les groupes et affecter tous les utilisateurs à 7eme WC2026 ?")) {
          event.preventDefault();
        }
      }}
    >
      <label className="space-y-2 text-sm font-medium">
        <span>Groupe par défaut</span>
        <input
          name="default_group_name"
          type="text"
          defaultValue="7eme WC2026"
          readOnly
          className="w-full rounded border border-amber-200 bg-amber-50 p-3 text-amber-950"
        />
      </label>

      <button type="submit" className="rounded bg-amber-700 px-4 py-3 font-semibold text-white">
        Réinitialiser les groupes
      </button>
    </form>
  );
}
