type AdminAuthUser = {
  id: string;
  email: string | null;
  created_at: string;
  user_metadata?: {
    first_name?: string;
    last_name?: string;
    nickname?: string;
    [key: string]: unknown;
  };
};

type AdminUsersResponse = {
  users?: AdminAuthUser[];
  error?: string;
  msg?: string;
  message?: string;
};

export async function listAdminUsers(perPage = 200): Promise<AdminAuthUser[]> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE)."
    );
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users?per_page=${perPage}`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const payload = (await response.json()) as AdminUsersResponse;

  if (!response.ok) {
    throw new Error(
      payload.message ?? payload.error ?? payload.msg ?? `Impossible de charger les utilisateurs (${response.status}).`
    );
  }

  return payload.users ?? [];
}