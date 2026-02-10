// global.d.ts
import { SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    supabaseInstance?: SupabaseClient;
    OneSignal?: {
      init: (options: {
        appId: string;
        safari_web_id?: string;
        notifyButton?: { enable: boolean };
        allowLocalhostAsSecureOrigin?: boolean;
      }) => void;
      getUserId: () => Promise<string | null>;
      push: (callback: () => void) => void;
    };
  }
}

export {};
