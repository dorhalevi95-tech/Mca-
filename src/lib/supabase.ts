import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type Check = {
  id: number;
  checked_at: string;
  slot_count: number;
  slots_found: string[];
  error: string | null;
};

export type Notification = {
  id: number;
  slot_label: string;
  notified_at: string;
};
