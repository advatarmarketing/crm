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
// "Overdue" is not in this list on purpose — it is a sent invoice
// past its due date, worked out at read time rather than stored.
export type InvoiceStatus = "draft" | "sent" | "paid";
// Phase 18 — not every client is on a monthly retainer.
export type BillingFrequency = "monthly" | "quarterly" | "annual" | "per_project" | "one_off";
export type ClientStage = "lead" | "proposal" | "active";
export type PlannerStatus = "draft" | "published";
// Phase 19 — 0018_schedule_resources.sql. There is deliberately no
// ScheduleEventKind union any more: 0019 replaced the fixed `kind`
// column with event_categories, which staff edit from the app, so the
// set of event types is data rather than something types can enumerate.
// Phase 21 — 0020_submissions_brand_kits.sql. The order here is the
// order the workflow moves in, and SUBMISSION_STATUSES below relies
// on that.
export type SubmissionStatus = "submitted" | "in_review" | "changes_requested" | "approved";
export type ResourceKind = "sop" | "tutorial" | "template" | "other";
export type ResourceAudience = "all" | "staff" | "videographer" | "operations_manager";

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
          // Phase 16 — see 0013_pipeline.sql.
          estimated_value: number | null;
          likelihood: number | null;
          last_contacted_at: string | null;
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
          estimated_value?: number | null;
          likelihood?: number | null;
          last_contacted_at?: string | null;
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
          estimated_value?: number | null;
          likelihood?: number | null;
          last_contacted_at?: string | null;
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
          // Phase 18: derived from billing_amount/billing_frequency by
          // a trigger — do not write it directly.
          monthly_value: number | null;
          billing_amount: number | null;
          billing_frequency: BillingFrequency | null;
          billing_notes: string | null;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          monthly_value?: number | null;
          billing_amount?: number | null;
          billing_frequency?: BillingFrequency | null;
          billing_notes?: string | null;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          monthly_value?: number | null;
          billing_amount?: number | null;
          billing_frequency?: BillingFrequency | null;
          billing_notes?: string | null;
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
          // Phase 15 — 'webhook' or 'manual'.
          source: string;
          meeting_url: string | null;
          title: string | null;
          created_by: string | null;
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
          source?: string;
          meeting_url?: string | null;
          title?: string | null;
          created_by?: string | null;
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
          source?: string;
          meeting_url?: string | null;
          title?: string | null;
          created_by?: string | null;
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
          storage_path: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_by: string | null;
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
          storage_path?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
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
          storage_path?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // Phase 17 — see 0014_onboarding_templates.sql.
      client_checklist_items: {
        Row: {
          id: string;
          client_id: string;
          label: string;
          position: number;
          done: boolean;
          done_at: string | null;
          done_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          label: string;
          position?: number;
          done?: boolean;
          done_at?: string | null;
          done_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          label?: string;
          position?: number;
          done?: boolean;
          done_at?: string | null;
          done_by?: string | null;
          created_at?: string;
        };
      };

      task_templates: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
      };

      task_template_items: {
        Row: {
          id: string;
          template_id: string;
          text: string;
          offset_days: number;
          position: number;
        };
        Insert: {
          id?: string;
          template_id: string;
          text: string;
          offset_days?: number;
          position?: number;
        };
        Update: {
          id?: string;
          template_id?: string;
          text?: string;
          offset_days?: number;
          position?: number;
        };
      };

      // Phase 15 — see 0012_documents_fathom_activity.sql.
      client_activity: {
        Row: {
          id: string;
          client_id: string;
          kind: string;
          summary: string;
          meta: Record<string, unknown> | null;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          kind: string;
          summary: string;
          meta?: Record<string, unknown> | null;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          kind?: string;
          summary?: string;
          meta?: Record<string, unknown> | null;
          actor_id?: string | null;
          created_at?: string;
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

      // Phase 22 — 0021_team_messages_sop_checklists.sql
      direct_messages: {
        Row: {
          id: string;
          sender_id: string;
          recipient_id: string;
          body: string;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          recipient_id: string;
          body: string;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          recipient_id?: string;
          body?: string;
          read?: boolean;
          created_at?: string;
        };
      };

      resource_checklist_items: {
        Row: {
          id: string;
          resource_id: string;
          text: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          resource_id: string;
          text: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          resource_id?: string;
          text?: string;
          position?: number;
          created_at?: string;
        };
      };

      resource_checklist_progress: {
        Row: {
          user_id: string;
          item_id: string;
          done: boolean;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          item_id: string;
          done?: boolean;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          item_id?: string;
          done?: boolean;
          updated_at?: string;
        };
      };

      // Phase 21 — 0020_submissions_brand_kits.sql
      submissions: {
        Row: {
          id: string;
          client_id: string | null;
          title: string;
          brief: string | null;
          status: SubmissionStatus;
          current_version: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id?: string | null;
          title: string;
          brief?: string | null;
          status?: SubmissionStatus;
          current_version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string | null;
          title?: string;
          brief?: string | null;
          status?: SubmissionStatus;
          current_version?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      submission_versions: {
        Row: {
          id: string;
          submission_id: string;
          version: number;
          url: string | null;
          notes: string | null;
          submitted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          version: number;
          url?: string | null;
          notes?: string | null;
          submitted_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          submission_id?: string;
          version?: number;
          url?: string | null;
          notes?: string | null;
          submitted_by?: string | null;
          created_at?: string;
        };
      };

      submission_feedback: {
        Row: {
          id: string;
          submission_id: string;
          version: number | null;
          body: string;
          author_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          version?: number | null;
          body: string;
          author_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          submission_id?: string;
          version?: number | null;
          body?: string;
          author_id?: string | null;
          created_at?: string;
        };
      };

      client_brand_kits: {
        Row: {
          client_id: string;
          colours: string[];
          fonts: string[];
          platforms: string[];
          logo_urls: string[];
          tone_of_voice: string | null;
          dos: string | null;
          donts: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          colours?: string[];
          fonts?: string[];
          platforms?: string[];
          logo_urls?: string[];
          tone_of_voice?: string | null;
          dos?: string | null;
          donts?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          colours?: string[];
          fonts?: string[];
          platforms?: string[];
          logo_urls?: string[];
          tone_of_voice?: string | null;
          dos?: string | null;
          donts?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
      };

      client_team_messages: {
        Row: {
          id: string;
          client_id: string;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          author_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          author_id?: string | null;
          body?: string;
          created_at?: string;
        };
      };

      // Phase 20 — 0019_event_categories.sql
      event_categories: {
        Row: {
          id: string;
          name: string;
          colour: string;
          position: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          colour?: string;
          position?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          colour?: string;
          position?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      // Phase 19 — 0018_schedule_resources.sql, `kind` replaced by
      // `category_id` in 0019.
      schedule_events: {
        Row: {
          id: string;
          title: string;
          starts_at: string;
          ends_at: string | null;
          all_day: boolean;
          location: string | null;
          notes: string | null;
          category_id: string | null;
          client_id: string | null;
          assigned_to: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          starts_at: string;
          ends_at?: string | null;
          all_day?: boolean;
          location?: string | null;
          notes?: string | null;
          category_id?: string | null;
          client_id?: string | null;
          assigned_to?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          starts_at?: string;
          ends_at?: string | null;
          all_day?: boolean;
          location?: string | null;
          notes?: string | null;
          category_id?: string | null;
          client_id?: string | null;
          assigned_to?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      resources: {
        Row: {
          id: string;
          title: string;
          kind: ResourceKind;
          url: string | null;
          body: string | null;
          audience_role: ResourceAudience;
          assigned_to: string | null;
          position: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          kind?: ResourceKind;
          url?: string | null;
          body?: string | null;
          audience_role?: ResourceAudience;
          assigned_to?: string | null;
          position?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          kind?: ResourceKind;
          url?: string | null;
          body?: string | null;
          audience_role?: ResourceAudience;
          assigned_to?: string | null;
          position?: number;
          created_by?: string | null;
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
          due_date: string | null;
          paid_at: string | null;
          status: InvoiceStatus | null;
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
          due_date?: string | null;
          paid_at?: string | null;
          status?: InvoiceStatus | null;
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
          due_date?: string | null;
          paid_at?: string | null;
          status?: InvoiceStatus | null;
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
