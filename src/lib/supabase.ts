import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type WeekResult = {
  weekNum: number;
  dateRange: string;
  slots: string[];
};

export type Check = {
  id: number;
  checked_at: string;
  slot_count: number;
  slots_found: string[];
  error: string | null;
  page_snapshot: string | null; // JSON-encoded WeekResult[] when successful
};

export type Notification = {
  id: number;
  slot_label: string;
  notified_at: string;
};
