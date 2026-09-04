/**
 * Hand-written to mirror supabase/migrations/0002_schema_rls.sql.
 *
 * This is NOT the output of `supabase gen types typescript` — that
 * requires a live Supabase project (a project ref + access token) or
 * a local Postgres instance to introspect, and this sandbox has
 * neither (and its outbound network is blocked from reaching
 * Supabase's API regardless — see the Phase 1/2 notes in README.md).
 * Once you've run the migrations against a real project, replace
 * this whole file with the real generated types:
 *
 *   npx supabase login
 *   npx supabase gen types typescript --project-id <ref> --schema public > lib/supabase/types.ts
 *
 * Do that before Phase 4 — hand-maintained types will drift the
 * moment the schema changes and won't catch it.
 */

export type ProfileRole = "ceo" | "operations_manager" | "staff" | "videographer" | "client";
export type LeadTemperature = "hot" | "warm" | "cold";
export type ClientStage = "lead" | "proposal" | "active";
export type PlannerStatus = "draft" | "published";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: ProfileRole;
          full_name: string | null;
          avatar_url: string | null;
          client_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: ProfileRole;
          full_name?: string | null;
          avatar_url?: string | null;
          client_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: ProfileRole;
          full_name?: string | null;
          avatar_url?: string | null;
          client_id?: string | null;
          created_at?: string;
        };
      };

      clients: {
        Row: {
          id: string;
          name: string;
          contact_name: string | null;
          contact_email: string | null;
          service: string | null;
          stage: ClientStage;
          next_action: string | null;
          avatar_url: string | null;
          notes: string | null;
          lead_source: string | null;
          lead_temperature: LeadTemperature | null;
          follow_up_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact_name?: string | null;
          contact_email?: string | null;
          service?: string | null;
          stage?: ClientStage;
          next_action?: string | null;
          avatar_url?: string | null;
          notes?: string | null;
          lead_source?: string | null;
          lead_temperature?: LeadTemperature | null;
          follow_up_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          contact_name?: string | null;
          contact_email?: string | null;
          service?: string | null;
          stage?: ClientStage;
          next_action?: string | null;
          avatar_url?: string | null;
          notes?: string | null;
          lead_source?: string | null;
          lead_temperature?: LeadTemperature | null;
          follow_up_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // ceo-only — split out from `clients` in Phase 4 (see
      // 0003_clients_finance_notes.sql) so RLS can actually enforce
      // "staff never sees revenue" at the row level. `clients` no
      // longer has a monthly_value column.
      client_finance: {
        Row: {
          client_id: string;
          monthly_value: number | null;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          monthly_value?: number | null;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          monthly_value?: number | null;
          updated_at?: string;
        };
      };

      client_staff: {
        Row: {
          client_id: string;
          staff_id: string;
          role_on_client: string | null;
          created_at: string;
        };
        Insert: {
          client_id: string;
          staff_id: string;
          role_on_client?: string | null;
          created_at?: string;
        };
        Update: {
          client_id?: string;
          staff_id?: string;
          role_on_client?: string | null;
          created_at?: string;
        };
      };

      planners: {
        Row: {
          id: string;
          client_id: string;
          content: Record<string, unknown>;
          status: PlannerStatus;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          content?: Record<string, unknown>;
          status?: PlannerStatus;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          content?: Record<string, unknown>;
          status?: PlannerStatus;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      fathom_calls: {
        Row: {
          id: string;
          fathom_call_id: string;
          client_id: string | null;
          raw_payload: Record<string, unknown> | null;
          summary: string | null;
          action_items: Record<string, unknown> | null;
          transcript_url: string | null;
          received_at: string | null;
          applied: boolean;
          // Phase 6 — see 0005_fathom_reviewed.sql. null = a human
          // hasn't opened this call's prospect review yet.
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          fathom_call_id: string;
          client_id?: string | null;
          raw_payload?: Record<string, unknown> | null;
          summary?: string | null;
          action_items?: Record<string, unknown> | null;
          transcript_url?: string | null;
          received_at?: string | null;
          applied?: boolean;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          fathom_call_id?: string;
          client_id?: string | null;
          raw_payload?: Record<string, unknown> | null;
          summary?: string | null;
          action_items?: Record<string, unknown> | null;
          transcript_url?: string | null;
          received_at?: string | null;
          applied?: boolean;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      documents: {
        Row: {
          id: string;
          client_id: string;
          name: string;
          type: string | null;
          status: string | null;
          url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          name: string;
          type?: string | null;
          status?: string | null;
          url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          name?: string;
          type?: string | null;
          status?: string | null;
          url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      tasks: {
        Row: {
          id: string;
          client_id: string | null;
          assigned_to: string | null;
          text: string;
          due_date: string | null;
          done: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id?: string | null;
          assigned_to?: string | null;
          text: string;
          due_date?: string | null;
          done?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string | null;
          assigned_to?: string | null;
          text?: string;
          due_date?: string | null;
          done?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };

      message_threads: {
        Row: {
          id: string;
          client_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          created_at?: string;
        };
      };

      messages: {
        Row: {
          id: string;
          thread_id: string;
          sender_id: string | null;
          sender_role: string | null;
          body: string;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          sender_id?: string | null;
          sender_role?: string | null;
          body: string;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          sender_id?: string | null;
          sender_role?: string | null;
          body?: string;
          read?: boolean;
          created_at?: string;
        };
      };

      invoices: {
        Row: {
          id: string;
          client_id: string;
          number: string | null;
          service: string | null;
          amount: number | null;
          invoice_date: string | null;
          status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          number?: string | null;
          service?: string | null;
          amount?: number | null;
          invoice_date?: string | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          number?: string | null;
          service?: string | null;
          amount?: number | null;
          invoice_date?: string | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      payments: {
        Row: {
          id: string;
          staff_id: string;
          amount: number;
          note: string | null;
          paid_on: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          staff_id: string;
          amount: number;
          note?: string | null;
          paid_on?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          staff_id?: string;
          amount?: number;
          note?: string | null;
          paid_on?: string;
          created_by?: string | null;
          created_at?: string;
        };
      };
    };
    // The current version of @supabase/supabase-js expects a Database
    // type to declare all five of these keys (Tables, Views,
    // Functions, Enums, CompositeTypes) to correctly work out the
    // return type of .select()/.insert()/.update() calls. This file
    // only ever declared Tables (it predates that stricter
    // requirement), which is what made some queries below silently
    // resolve to `never`/`never[]` and fail Vercel's build with
    // "Type error: ... does not exist in type 'never'" — the code was
    // always fine at runtime, the type information was just
    // incomplete. Declaring the other four as empty here is
    // sufficient; this project doesn't use database views, stored
    // functions, enum types, or composite types.
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
