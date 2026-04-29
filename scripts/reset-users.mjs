import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const keepEmails = (process.env.RESET_KEEP_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);

const usersToCreate = JSON.parse(process.env.RESET_USERS_JSON ?? "[]");

if (!Array.isArray(usersToCreate)) {
  throw new Error("RESET_USERS_JSON doit contenir un tableau JSON.");
}

if (keepEmails.length === 0 || usersToCreate.length === 0) {
  throw new Error(
    "RESET_KEEP_EMAILS et RESET_USERS_JSON doivent etre renseignes dans l'environnement."
  );
}

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) throw error;

  const users = data.users;

  for (const user of users) {
    if (!keepEmails.includes(user.email ?? "")) {
      console.log("Suppression:", user.email);

      await supabase.from("profiles").delete().eq("id", user.id);
      await supabase.from("user_scores").delete().eq("user_id", user.id);
      await supabase.from("predictions").delete().eq("user_id", user.id);

      const { error: deleteError } = await supabase.auth.admin.deleteUser(
        user.id
      );

      if (deleteError) throw deleteError;
    }
  }

  for (const newUser of usersToCreate) {
    console.log("Création:", newUser.email);

    const { data: created, error: createError } =
      await supabase.auth.admin.createUser({
        email: newUser.email,
        password: newUser.password,
        email_confirm: true,
      });

    if (createError) throw createError;

    const userId = created.user.id;

    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      nickname: newUser.nickname,
      first_name: newUser.first_name,
      last_name: newUser.last_name,
      is_admin: newUser.is_admin,
    });

    if (profileError) throw profileError;

    await supabase.from("user_scores").upsert({
      user_id: userId,
      points: 0,
    });
  }

  console.log("Reset terminé.");
}

main();
