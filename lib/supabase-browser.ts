import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabaseBrowser = createClient(url, anonKey);
export const supabase = supabaseBrowser;

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session }
  } = await supabaseBrowser.auth.getSession();

  if (!session?.access_token) {
    return {};
  }

  return {
    Authorization: `Bearer ${session.access_token}`
  };
}
