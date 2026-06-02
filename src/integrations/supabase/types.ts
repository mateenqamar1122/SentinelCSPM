export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          id: string
          identifier: string
          last_scan_at: string | null
          metadata: Json
          name: string
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          id?: string
          identifier: string
          last_scan_at?: string | null
          metadata?: Json
          name: string
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          id?: string
          identifier?: string
          last_scan_at?: string | null
          metadata?: Json
          name?: string
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          category: string
          created_at: string
          description: string | null
          done: boolean
          framework: string
          id: string
          notes: string | null
          priority: string
          session_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          done?: boolean
          framework?: string
          id?: string
          notes?: string | null
          priority?: string
          session_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          done?: boolean
          framework?: string
          id?: string
          notes?: string | null
          priority?: string
          session_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cloud_connections: {
        Row: {
          created_at: string
          credentials: Json
          id: string
          last_scan_at: string | null
          name: string
          provider: Database["public"]["Enums"]["cloud_provider"]
          session_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials?: Json
          id?: string
          last_scan_at?: string | null
          name: string
          provider: Database["public"]["Enums"]["cloud_provider"]
          session_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials?: Json
          id?: string
          last_scan_at?: string | null
          name?: string
          provider?: Database["public"]["Enums"]["cloud_provider"]
          session_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      engagement_messages: {
        Row: {
          body: string
          created_at: string
          engagement_id: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          engagement_id: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          engagement_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagement_messages_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          budget: number | null
          created_at: string
          id: string
          pentester_id: string
          scope: string
          startup_id: string
          status: Database["public"]["Enums"]["engagement_status"]
          timeline: string | null
          title: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          id?: string
          pentester_id: string
          scope: string
          startup_id: string
          status?: Database["public"]["Enums"]["engagement_status"]
          timeline?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          id?: string
          pentester_id?: string
          scope?: string
          startup_id?: string
          status?: Database["public"]["Enums"]["engagement_status"]
          timeline?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      findings: {
        Row: {
          asset_id: string | null
          asset_type: Database["public"]["Enums"]["asset_type"] | null
          category: string
          compliance: string[] | null
          created_at: string
          cve_id: string | null
          description: string
          id: string
          mitigation: string
          region: string | null
          resource: string
          rule_id: string
          scan_id: string
          session_id: string
          severity: Database["public"]["Enums"]["finding_severity"]
          title: string
        }
        Insert: {
          asset_id?: string | null
          asset_type?: Database["public"]["Enums"]["asset_type"] | null
          category: string
          compliance?: string[] | null
          created_at?: string
          cve_id?: string | null
          description: string
          id?: string
          mitigation: string
          region?: string | null
          resource: string
          rule_id: string
          scan_id: string
          session_id: string
          severity: Database["public"]["Enums"]["finding_severity"]
          title: string
        }
        Update: {
          asset_id?: string | null
          asset_type?: Database["public"]["Enums"]["asset_type"] | null
          category?: string
          compliance?: string[] | null
          created_at?: string
          cve_id?: string | null
          description?: string
          id?: string
          mitigation?: string
          region?: string | null
          resource?: string
          rule_id?: string
          scan_id?: string
          session_id?: string
          severity?: Database["public"]["Enums"]["finding_severity"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          created_at: string
          detected_at: string
          id: string
          playbook: string | null
          resolved_at: string | null
          session_id: string
          severity: string
          status: string
          summary: string | null
          timeline: Json
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detected_at?: string
          id?: string
          playbook?: string | null
          resolved_at?: string | null
          session_id: string
          severity?: string
          status?: string
          summary?: string | null
          timeline?: Json
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          id?: string
          playbook?: string | null
          resolved_at?: string | null
          session_id?: string
          severity?: string
          status?: string
          summary?: string | null
          timeline?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pentester_profiles: {
        Row: {
          availability: Database["public"]["Enums"]["availability_status"]
          bio: string
          certifications: string[]
          created_at: string
          github_url: string | null
          headline: string
          hourly_rate: number | null
          id: string
          linkedin_url: string | null
          location: string | null
          published: boolean
          skills: string[]
          specialties: string[]
          updated_at: string
          user_id: string
          verified: boolean
          website_url: string | null
          years_experience: number
        }
        Insert: {
          availability?: Database["public"]["Enums"]["availability_status"]
          bio?: string
          certifications?: string[]
          created_at?: string
          github_url?: string | null
          headline?: string
          hourly_rate?: number | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          published?: boolean
          skills?: string[]
          specialties?: string[]
          updated_at?: string
          user_id: string
          verified?: boolean
          website_url?: string | null
          years_experience?: number
        }
        Update: {
          availability?: Database["public"]["Enums"]["availability_status"]
          bio?: string
          certifications?: string[]
          created_at?: string
          github_url?: string | null
          headline?: string
          hourly_rate?: number | null
          id?: string
          linkedin_url?: string | null
          location?: string | null
          published?: boolean
          skills?: string[]
          specialties?: string[]
          updated_at?: string
          user_id?: string
          verified?: boolean
          website_url?: string | null
          years_experience?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      questionnaires: {
        Row: {
          answers: Json
          created_at: string
          id: string
          name: string
          questions: Json
          session_id: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          name: string
          questions?: Json
          session_id: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          name?: string
          questions?: Json
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scans: {
        Row: {
          asset_id: string | null
          connection_id: string | null
          created_at: string
          critical_count: number
          error_message: string | null
          finished_at: string | null
          high_count: number
          id: string
          info_count: number
          low_count: number
          medium_count: number
          resources_scanned: number
          scan_kind: Database["public"]["Enums"]["scan_kind"]
          session_id: string
          started_at: string
          status: Database["public"]["Enums"]["scan_status"]
          total_findings: number
        }
        Insert: {
          asset_id?: string | null
          connection_id?: string | null
          created_at?: string
          critical_count?: number
          error_message?: string | null
          finished_at?: string | null
          high_count?: number
          id?: string
          info_count?: number
          low_count?: number
          medium_count?: number
          resources_scanned?: number
          scan_kind?: Database["public"]["Enums"]["scan_kind"]
          session_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
          total_findings?: number
        }
        Update: {
          asset_id?: string | null
          connection_id?: string | null
          created_at?: string
          critical_count?: number
          error_message?: string | null
          finished_at?: string | null
          high_count?: number
          id?: string
          info_count?: number
          low_count?: number
          medium_count?: number
          resources_scanned?: number
          scan_kind?: Database["public"]["Enums"]["scan_kind"]
          session_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
          total_findings?: number
        }
        Relationships: []
      }
      siem_connections: {
        Row: {
          config: Json
          created_at: string
          id: string
          ingest_token: string
          last_sync_at: string | null
          name: string
          provider: Database["public"]["Enums"]["siem_provider"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          ingest_token?: string
          last_sync_at?: string | null
          name: string
          provider: Database["public"]["Enums"]["siem_provider"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          ingest_token?: string
          last_sync_at?: string | null
          name?: string
          provider?: Database["public"]["Enums"]["siem_provider"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      soc_alerts: {
        Row: {
          ai_confidence: number | null
          ai_verdict: Database["public"]["Enums"]["soc_verdict"]
          created_at: string
          external_id: string | null
          id: string
          mitre_tactics: string[]
          raw: Json
          received_at: string
          severity: string
          siem_connection_id: string | null
          source: string
          status: Database["public"]["Enums"]["soc_alert_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_verdict?: Database["public"]["Enums"]["soc_verdict"]
          created_at?: string
          external_id?: string | null
          id?: string
          mitre_tactics?: string[]
          raw?: Json
          received_at?: string
          severity?: string
          siem_connection_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["soc_alert_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_verdict?: Database["public"]["Enums"]["soc_verdict"]
          created_at?: string
          external_id?: string | null
          id?: string
          mitre_tactics?: string[]
          raw?: Json
          received_at?: string
          severity?: string
          siem_connection_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["soc_alert_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "soc_alerts_siem_connection_id_fkey"
            columns: ["siem_connection_id"]
            isOneToOne: false
            referencedRelation: "siem_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      soc_investigations: {
        Row: {
          alert_id: string
          completed_at: string | null
          created_at: string
          enrichments: Json
          guardrail_flags: Json
          id: string
          model: string | null
          reasoning_steps: Json
          recommended_actions: Json
          status: string
          summary: string | null
          user_id: string
        }
        Insert: {
          alert_id: string
          completed_at?: string | null
          created_at?: string
          enrichments?: Json
          guardrail_flags?: Json
          id?: string
          model?: string | null
          reasoning_steps?: Json
          recommended_actions?: Json
          status?: string
          summary?: string | null
          user_id: string
        }
        Update: {
          alert_id?: string
          completed_at?: string | null
          created_at?: string
          enrichments?: Json
          guardrail_flags?: Json
          id?: string
          model?: string | null
          reasoning_steps?: Json
          recommended_actions?: Json
          status?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "soc_investigations_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "soc_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          features: Json
          id: string
          polar_customer_id: string | null
          polar_product_id: string | null
          polar_subscription_id: string | null
          status: string
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          features?: Json
          id?: string
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          status?: string
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          features?: Json
          id?: string
          polar_customer_id?: string | null
          polar_product_id?: string | null
          polar_subscription_id?: string | null
          status?: string
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      threat_intel_alerts: {
        Row: {
          affected_tech: string[]
          created_at: string
          cve_id: string
          description: string
          id: string
          kev_listed: boolean
          published_at: string | null
          references_urls: string[]
          session_id: string
          severity: Database["public"]["Enums"]["finding_severity"]
          title: string
        }
        Insert: {
          affected_tech?: string[]
          created_at?: string
          cve_id: string
          description: string
          id?: string
          kev_listed?: boolean
          published_at?: string | null
          references_urls?: string[]
          session_id: string
          severity: Database["public"]["Enums"]["finding_severity"]
          title: string
        }
        Update: {
          affected_tech?: string[]
          created_at?: string
          cve_id?: string
          description?: string
          id?: string
          kev_listed?: boolean
          published_at?: string | null
          references_urls?: string[]
          session_id?: string
          severity?: Database["public"]["Enums"]["finding_severity"]
          title?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          category: string
          created_at: string
          criticality: string
          data_access: string[]
          id: string
          name: string
          notes: string | null
          owner: string | null
          renewal_date: string | null
          session_id: string
          soc2_status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          criticality?: string
          data_access?: string[]
          id?: string
          name: string
          notes?: string | null
          owner?: string | null
          renewal_date?: string | null
          session_id: string
          soc2_status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          criticality?: string
          data_access?: string[]
          id?: string
          name?: string
          notes?: string | null
          owner?: string | null
          renewal_date?: string | null
          session_id?: string
          soc2_status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      cloud_connections_safe: {
        Row: {
          created_at: string | null
          has_credentials: boolean | null
          id: string | null
          last_scan_at: string | null
          name: string | null
          provider: Database["public"]["Enums"]["cloud_provider"] | null
          session_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          has_credentials?: never
          id?: string | null
          last_scan_at?: string | null
          name?: string | null
          provider?: Database["public"]["Enums"]["cloud_provider"] | null
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          has_credentials?: never
          id?: string | null
          last_scan_at?: string | null
          name?: string | null
          provider?: Database["public"]["Enums"]["cloud_provider"] | null
          session_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_session_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "startup" | "pentester" | "admin"
      asset_type:
        | "cloud"
        | "code_repo"
        | "container_image"
        | "kubernetes"
        | "ai_workflow"
      availability_status: "available" | "limited" | "unavailable"
      cloud_provider: "aws" | "gcp" | "azure" | "demo"
      engagement_status:
        | "requested"
        | "accepted"
        | "declined"
        | "in_progress"
        | "completed"
        | "cancelled"
      finding_severity: "critical" | "high" | "medium" | "low" | "info"
      scan_kind:
        | "cloud"
        | "code"
        | "container"
        | "kubernetes"
        | "ai_security"
        | "threat_intel"
      scan_status: "pending" | "running" | "completed" | "failed"
      siem_provider:
        | "splunk"
        | "sentinel"
        | "elastic"
        | "chronicle"
        | "datadog"
        | "qradar"
        | "other"
        | "wazuh"
      soc_alert_status: "new" | "triaging" | "investigated" | "closed"
      soc_verdict:
        | "true_positive"
        | "false_positive"
        | "benign"
        | "needs_human"
        | "pending"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["startup", "pentester", "admin"],
      asset_type: [
        "cloud",
        "code_repo",
        "container_image",
        "kubernetes",
        "ai_workflow",
      ],
      availability_status: ["available", "limited", "unavailable"],
      cloud_provider: ["aws", "gcp", "azure", "demo"],
      engagement_status: [
        "requested",
        "accepted",
        "declined",
        "in_progress",
        "completed",
        "cancelled",
      ],
      finding_severity: ["critical", "high", "medium", "low", "info"],
      scan_kind: [
        "cloud",
        "code",
        "container",
        "kubernetes",
        "ai_security",
        "threat_intel",
      ],
      scan_status: ["pending", "running", "completed", "failed"],
      siem_provider: [
        "splunk",
        "sentinel",
        "elastic",
        "chronicle",
        "datadog",
        "qradar",
        "other",
        "wazuh",
      ],
      soc_alert_status: ["new", "triaging", "investigated", "closed"],
      soc_verdict: [
        "true_positive",
        "false_positive",
        "benign",
        "needs_human",
        "pending",
      ],
    },
  },
} as const
