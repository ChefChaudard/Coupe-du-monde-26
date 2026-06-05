"use client";

import { useState } from "react";

type ManagedUser = {
  id: string;
  nickname: string;
  isAdmin: boolean;
  email: string;
};

type Props = {
  users: ManagedUser[];
  action: (formData: FormData) => Promise<void>;
};

export default function PasswordResetPanel({ users, action }: Props) {
  const firstUserId = users[0]?.id ?? "";
  const [selectedUserId, setSelectedUserId] = useState(firstUserId);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0];

  return (
    <form action={action} className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] md:items-end">
        <label className="space-y-2 text-sm font-medium">
          <span>Utilisateur</span>
          <select
            name="user_id"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="w-full rounded border p-3"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
                {user.nickname ? ` · ${user.nickname}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          <span>Nouveau mot de passe</span>
          <input
            name="password"
            type="password"
            placeholder="Saisir le nouveau mot de passe"
            className="w-full rounded border p-3"
            autoComplete="new-password"
          />
        </label>

        <button className="rounded bg-black px-4 py-3 font-semibold text-white">
          Mettre à jour
        </button>
      </div>

      {selectedUser ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p className="font-semibold text-slate-900">Compte sélectionné</p>
          <p>{selectedUser.email}</p>
          {selectedUser.nickname ? <p>Pseudo: {selectedUser.nickname}</p> : null}
          <p>ID: {selectedUser.id}</p>
          <p>Admin: {selectedUser.isAdmin ? "oui" : "non"}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Aucun compte disponible.
        </div>
      )}
    </form>
  );
}
