import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Admin service is not configured." }, 500);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in as an administrator." }, 401);

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
  if (authError || !caller) return json({ error: "Your session is invalid. Please sign in again." }, 401);

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: members, error: listError } = await adminClient.rpc("ntwrkh_admin_list_members");
  if (listError) return json({ error: "Administrator permissions could not be verified." }, 500);
  if (!Array.isArray(members) || !members.some((m: any) => m.user_id === caller.id)) {
    return json({ error: "Administrator access required." }, 403);
  }

  let body: { action?: string; email?: string; userId?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid request body." }, 400); }

  if (body.action === "list") {
    const users: Array<{ id: string; email?: string }> = [];
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return json({ error: "Could not resolve administrator accounts." }, 500);
      users.push(...data.users.map((u) => ({ id: u.id, email: u.email || undefined })));
      if (data.users.length < 1000) break;
    }
    const byId = new Map(users.map((u) => [u.id, u.email]));
    return json({ administrators: members.map((m: any) => ({
      userId: m.user_id, email: byId.get(m.user_id) || "Email unavailable",
      grantedAt: m.granted_at, grantedBy: m.granted_by, isCurrentUser: m.user_id === caller.id,
    })) });
  }

  if (body.action === "invite") {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: "Enter a valid email address." }, 400);
    }
    let matchedUser: { id: string; email?: string } | null = null;
    for (let page = 1; page <= 10 && !matchedUser; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return json({ error: "Could not check whether this account already exists." }, 500);
      const found = data.users.find((u) => (u.email || "").toLowerCase() === email);
      if (found) matchedUser = { id: found.id, email: found.email || undefined };
      if (data.users.length < 1000) break;
    }
    let wasInvited = false;
    if (!matchedUser) {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
      if (error || !data.user) return json({ error: error?.message || "The invitation could not be sent." }, 400);
      matchedUser = { id: data.user.id, email: data.user.email || email };
      wasInvited = true;
    }
    const { error: grantError } = await adminClient.rpc("ntwrkh_admin_set_membership", {
      p_action: "grant", p_user_id: matchedUser.id, p_granted_by: caller.email || caller.id,
    });
    if (grantError) return json({ error: "The account was found, but administrator access could not be granted. Please retry." }, 500);
    return json({
      success: true,
      invited: matchedUser.email,
      message: wasInvited
        ? "Invitation sent and administrator access prepared. They must accept the email invitation before signing in."
        : "Administrator access granted to the existing account.",
    });
  }

  if (body.action === "revoke") {
    const targetId = String(body.userId || "");
    if (!targetId) return json({ error: "Select an administrator to revoke." }, 400);
    if (targetId === caller.id) return json({ error: "You cannot revoke your own administrator access here." }, 400);
    const { error } = await adminClient.rpc("ntwrkh_admin_set_membership", {
      p_action: "revoke", p_user_id: targetId, p_granted_by: caller.email || caller.id,
    });
    if (error) return json({ error: error.message || "Administrator access could not be revoked." }, 400);
    return json({ success: true });
  }
  return json({ error: "Unknown admin action." }, 400);
});
