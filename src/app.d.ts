import type { Session, SupabaseClient } from '@supabase/supabase-js';

declare global {
  namespace App {
    interface PageData {
      supabase: SupabaseClient;
      session: Session | null;
    }
  }
}
export {};
