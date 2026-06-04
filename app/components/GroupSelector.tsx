"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const STORAGE_KEY = "activeGroupId";
const STORAGE_NAME_KEY = "activeGroupName";

type GroupRow = {
  id: string;
  name: string;
};

type GroupRelationRow = {
  groups?: GroupRow[];
};

type ActiveGroup = {
  id: string;
  name: string;
} | null;

type CurrentUserResponse = {
  user: {
    groups?: GroupRow[];
  } | null;
};

type AuthUser = {
  id: string;
};

async function fetchCurrentUser() {
  const response = await fetch("/api/me", { cache: "no-store" });

  if (!response.ok) return null;

  const payload = (await response.json()) as CurrentUserResponse;
  return payload.user;
}

async function fetchBrowserUser() {
  const { data } = await supabase.auth.getUser();
  return data.user as AuthUser | null;
}

async function fetchGroupsForUser(userId: string) {
  const { data: membershipRows, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id, groups(id, name)")
    .eq("user_id", userId);

  if (membershipError) {
    throw membershipError;
  }

  const { data: adminRows, error: adminError } = await supabase
    .from("group_admins")
    .select("group_id, groups(id, name)")
    .eq("user_id", userId);

  if (adminError) {
    throw adminError;
  }

  return Array.from(
    new Map(
      [...(membershipRows ?? []), ...(adminRows ?? [])]
        .map((row: GroupRelationRow) => row.groups?.[0])
        .filter((group): group is GroupRow => Boolean(group))
        .map((group) => [group.id, group])
    ).values()
  );
}

export default function GroupSelector() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [activeGroup, setActiveGroup] = useState<ActiveGroup>(() => {
    if (typeof window === "undefined") return null;
    const savedId = localStorage.getItem(STORAGE_KEY);
    const savedName = localStorage.getItem(STORAGE_NAME_KEY);

    return savedId && savedName ? { id: savedId, name: savedName } : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {

    async function loadGroups() {
      setLoading(true);
      setError(null);

      try {
        const apiUser = await fetchCurrentUser();

        if (apiUser?.groups && apiUser.groups.length > 0) {
          const loadedGroups = apiUser.groups;

          setGroups(loadedGroups);

          const savedId = window.localStorage.getItem(STORAGE_KEY);
          const savedGroup = savedId
            ? loadedGroups.find((group) => group.id === savedId)
            : null;

          if (savedGroup) {
            setActiveGroup(savedGroup);
            return;
          }

          const firstGroup = loadedGroups[0];
          window.localStorage.setItem(STORAGE_KEY, firstGroup.id);
          window.localStorage.setItem(STORAGE_NAME_KEY, firstGroup.name);
          setActiveGroup(firstGroup);
          window.dispatchEvent(
            new CustomEvent("active-group-updated", { detail: firstGroup })
          );
          return;
        }

        const browserUser = await fetchBrowserUser();

        if (!browserUser) {
          if (!apiUser) {
            setGroups([]);
            setActiveGroup(null);
            return;
          }

          const loadedGroups = apiUser.groups ?? [];

          if (loadedGroups.length === 0) {
            setGroups([]);
            return;
          }

          setGroups(loadedGroups);

          const savedId = window.localStorage.getItem(STORAGE_KEY);
          const savedGroup = savedId
            ? loadedGroups.find((group) => group.id === savedId)
            : null;

          if (savedGroup) {
            setActiveGroup(savedGroup);
            return;
          }

          const firstGroup = loadedGroups[0];
          window.localStorage.setItem(STORAGE_KEY, firstGroup.id);
          window.localStorage.setItem(STORAGE_NAME_KEY, firstGroup.name);
          setActiveGroup(firstGroup);
          window.dispatchEvent(
            new CustomEvent("active-group-updated", { detail: firstGroup })
          );
          return;
        }

        const loadedGroups = await fetchGroupsForUser(browserUser.id);

        if (loadedGroups.length === 0) {
          setGroups([]);
          return;
        }

        setGroups(loadedGroups);

        const savedId = window.localStorage.getItem(STORAGE_KEY);
        const savedGroup = savedId
          ? loadedGroups.find((group) => group.id === savedId)
          : null;

        if (savedGroup) {
          setActiveGroup(savedGroup);
          return;
        }

        const firstGroup = loadedGroups[0];
        window.localStorage.setItem(STORAGE_KEY, firstGroup.id);
        window.localStorage.setItem(STORAGE_NAME_KEY, firstGroup.name);
        setActiveGroup(firstGroup);
        window.dispatchEvent(
          new CustomEvent("active-group-updated", { detail: firstGroup })
        );
      } catch (error) {
        console.error("GroupSelector error", error);
        setError("Impossible de charger les groupes.");
      } finally {
        setLoading(false);
      }
    }

    void loadGroups();
  }, []);

  useEffect(() => {
    const handler = () => {
      const active = localStorage.getItem(STORAGE_KEY);
      const name = localStorage.getItem(STORAGE_NAME_KEY);

      if (active && name) {
        setActiveGroup({ id: active, name });
      } else {
        setActiveGroup(null);
      }
    };

    window.addEventListener("active-group-updated", handler);
    return () => window.removeEventListener("active-group-updated", handler);
  }, []);

  const handleChange = (groupId: string) => {
    const selectedGroup = groups.find((group) => group.id === groupId);
    if (!selectedGroup) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_NAME_KEY);
      setActiveGroup(null);
      window.dispatchEvent(new CustomEvent("active-group-updated"));
      return;
    }

    localStorage.setItem(STORAGE_KEY, selectedGroup.id);
    localStorage.setItem(STORAGE_NAME_KEY, selectedGroup.name);
    setActiveGroup(selectedGroup);
    window.dispatchEvent(
      new CustomEvent("active-group-updated", {
        detail: selectedGroup,
      })
    );
  };

  if (loading) {
    return (
      <div className="rounded-full border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-700">
        Chargement des groupes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-full border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="rounded-full border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-700">
        Aucun groupe actif
      </div>
    );
  }

  return (
    <label className="rounded-full border border-emerald-100 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
      <span className="sr-only">Sélecteur de groupe actif</span>
      <select
        value={activeGroup?.id ?? ""}
        onChange={(event) => handleChange(event.target.value)}
        className="bg-transparent text-sm font-medium outline-none"
      >
        <option value="">Aucun groupe</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </label>
  );
}
