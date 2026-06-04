"use client";

import { useEffect, useMemo, useState } from "react";
import { addGroupMemberById, removeGroupMemberById } from "./actions";

type GroupRow = {
  id: string;
  name: string;
};

type UserRow = {
  id: string;
  email: string | null;
  nickname: string | null;
};

type MembershipRow = {
  group_id: string;
  user_id: string;
  profiles?: {
    id: string;
    nickname?: string | null;
  }[];
};

type Props = {
  groups: GroupRow[];
  users: UserRow[];
  membershipsByGroup: Record<string, MembershipRow[]>;
};

export default function GroupMembershipMapper({
  groups,
  users,
  membershipsByGroup,
}: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");

  const groupMembers = useMemo(
    () => membershipsByGroup[selectedGroupId] ?? [],
    [selectedGroupId, membershipsByGroup]
  );

  const groupMemberIds = useMemo(
    () => new Set(groupMembers.map((member) => member.user_id)),
    [groupMembers]
  );

  const availableUsers = useMemo(
    () => users.filter((user) => !groupMemberIds.has(user.id)),
    [users, groupMemberIds]
  );

  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users]
  );

  useEffect(() => {
    if (availableUsers.length === 0) {
      setSelectedUserId("");
      return;
    }

    setSelectedUserId((currentUserId) =>
      availableUsers.some((user) => user.id === currentUserId)
        ? currentUserId
        : availableUsers[0].id
    );
  }, [availableUsers]);

  useEffect(() => {
    if (groupMembers.length === 0) {
      setSelectedMemberId("");
      return;
    }

    setSelectedMemberId((currentMemberId) =>
      groupMembers.some((member) => member.user_id === currentMemberId)
        ? currentMemberId
        : groupMembers[0].user_id
    );
  }, [groupMembers]);

  const formatUserLabel = (user: UserRow) =>
    user.nickname
      ? `${user.nickname}${user.email ? ` (${user.email})` : ""}`
      : user.email ?? user.id;

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border p-6">
      <h2 className="mb-4 text-3xl font-bold">Associer des comptes à un groupe</h2>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
        <label className="space-y-2 text-sm font-medium">
          <span>Groupe</span>
          <select
            value={selectedGroupId}
            onChange={(event) => {
              setSelectedGroupId(event.target.value);
              setSelectedUserId("");
              setSelectedMemberId("");
            }}
            className="w-full rounded border p-3"
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Sélectionnez un groupe, puis choisissez un compte à gauche et cliquez sur <strong>Ajouter →</strong> pour l’ajouter au groupe.
          Vous pouvez aussi sélectionner un membre à droite et cliquer sur <strong>← Retirer</strong>.
        </div>
      </div>

      <div className="grid gap-4 lg:items-start lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.6fr)_minmax(0,1.4fr)]">
        <div className="min-w-0">
          <h3 className="mb-3 text-lg font-semibold">Comptes du site</h3>
          <select
            name="user_id"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            size={7}
            className="h-full w-full max-w-full rounded border p-3"
          >
            {availableUsers.length === 0 ? (
              <option disabled>Aucun compte disponible</option>
            ) : (
              availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {formatUserLabel(user)}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex min-w-0 flex-col items-center justify-center gap-4">
          <form action={addGroupMemberById} className="space-y-3">
            <input type="hidden" name="group_id" value={selectedGroupId} />
            <input type="hidden" name="user_id" value={selectedUserId} />
            <button
              type="submit"
              disabled={!selectedUserId}
              className="inline-flex h-12 items-center justify-center rounded bg-black px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ajouter →
            </button>
          </form>

          <form action={removeGroupMemberById} className="space-y-3">
            <input type="hidden" name="group_id" value={selectedGroupId} />
            <input type="hidden" name="user_id" value={selectedMemberId} />
            <button
              type="submit"
              disabled={!selectedMemberId}
              className="inline-flex h-12 items-center justify-center rounded bg-red-600 px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              ← Retirer
            </button>
          </form>
        </div>

        <div className="min-w-0">
          <h3 className="mb-3 text-lg font-semibold">Membres du groupe</h3>
          <select
            value={selectedMemberId}
            onChange={(event) => setSelectedMemberId(event.target.value)}
            size={7}
            className="h-full w-full max-w-full rounded border p-3"
          >
            {groupMembers.length === 0 ? (
              <option disabled>Aucun membre pour le moment</option>
            ) : (
              groupMembers.map((membership) => (
                <option key={membership.user_id} value={membership.user_id}>
                  {membership.profiles?.[0]?.nickname ?? userById.get(membership.user_id)?.nickname ?? userById.get(membership.user_id)?.email ?? membership.user_id}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
    </section>
  );
}
