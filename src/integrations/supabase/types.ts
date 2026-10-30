export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      students: {
        Row: {
          apaar_id: string | null;
          apaar_verify_status: string | null;
          apaar_verified_at: string | null;
          category: string | null;
          consent_recorded: boolean | null;
          contact: string | null;
          created_at: string;
          current_status: string | null;
          dob: string | null;
          gender: string | null;
          id: string;
          institution_id: string | null;
          intake_type: string | null;
          name: string;
          programme_code: string | null;
          student_id: string | null;
          user_id: string;
          admission_year: number | null;
        };
        Insert: {
          apaar_id?: string | null;
          apaar_verify_status?: string | null;
          apaar_verified_at?: string | null;
          category?: string | null;
          consent_recorded?: boolean | null;
          contact?: string | null;
          created_at?: string;
          current_status?: string | null;
          dob?: string | null;
          gender?: string | null;
          id?: string;
          institution_id?: string | null;
          intake_type?: string | null;
          name: string;
          programme_code?: string | null;
          student_id?: string | null;
          user_id: string;
          admission_year?: number | null;
        };
        Update: {
          apaar_id?: string | null;
          apaar_verify_status?: string | null;
          apaar_verified_at?: string | null;
          category?: string | null;
          consent_recorded?: boolean | null;
          contact?: string | null;
          created_at?: string;
          current_status?: string | null;
          dob?: string | null;
          gender?: string | null;
          id?: string;
          institution_id?: string | null;
          intake_type?: string | null;
          name?: string;
          programme_code?: string | null;
          student_id?: string | null;
          user_id?: string;
          admission_year?: number | null;
        };
        Relationships: [];
      };
      institutions: {
        Row: {
          id: string;
          name: string;
          aicte_id: string | null;
          region: string | null;
          affiliation: string | null;
          address: string | null;
          contact_email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          aicte_id?: string | null;
          region?: string | null;
          affiliation?: string | null;
          address?: string | null;
          contact_email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          aicte_id?: string | null;
          region?: string | null;
          affiliation?: string | null;
          address?: string | null;
          contact_email?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      programmes: {
        Row: {
          id: string;
          institution_id: string;
          course_code: string;
          course_name: string | null;
          year: number;
          intake_approved: number;
          intake_nri: number;
          intake_supernumerary: number;
          other_details: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          institution_id: string;
          course_code: string;
          course_name?: string | null;
          year?: number;
          intake_approved?: number;
          intake_nri?: number;
          intake_supernumerary?: number;
          other_details?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          institution_id?: string;
          course_code?: string;
          course_name?: string | null;
          year?: number;
          intake_approved?: number;
          intake_nri?: number;
          intake_supernumerary?: number;
          other_details?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "programmes_institution_id_fkey";
            columns: ["institution_id"];
            referencedRelation: "institutions";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          id: string;
          student_id: string;
          programme_id: string;
          academic_year_id: string;
          semester: number | null;
          admission_type: string;
          status: string;
          enrolled_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          programme_id: string;
          academic_year_id: string;
          semester?: number | null;
          admission_type?: string;
          status?: string;
          enrolled_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          programme_id?: string;
          academic_year_id?: string;
          semester?: number | null;
          admission_type?: string;
          status?: string;
          enrolled_at?: string;
        };
        Relationships: [];
      };
      duplicate_cases: {
        Row: {
          id: string;
          student_ids: string[];
          reason: string;
          status: string;
          reviewed_by: string | null;
          resolution: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_ids: string[];
          reason: string;
          status?: string;
          reviewed_by?: string | null;
          resolution?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_ids?: string[];
          reason?: string;
          status?: string;
          reviewed_by?: string | null;
          resolution?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json | null;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          details?: Json | null;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          message: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          message?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          message?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: string;
          institution_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: string;
          institution_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: string;
          institution_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      academic_years: {
        Row: {
          id: string;
          label: string;
          start_date: string;
          end_date: string;
          reporting_deadline: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          label: string;
          start_date: string;
          end_date: string;
          reporting_deadline?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          label?: string;
          start_date?: string;
          end_date?: string;
          reporting_deadline?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      correction_requests: {
        Row: {
          id: string;
          student_id: string;
          requested_by: string;
          field_name: string;
          current_value: string | null;
          proposed_value: string;
          reason: string;
          status: string;
          reviewed_by: string | null;
          reviewer_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          requested_by: string;
          field_name: string;
          current_value?: string | null;
          proposed_value: string;
          reason: string;
          status?: string;
          reviewed_by?: string | null;
          reviewer_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          requested_by?: string;
          field_name?: string;
          current_value?: string | null;
          proposed_value?: string;
          reason?: string;
          status?: string;
          reviewed_by?: string | null;
          reviewer_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "correction_requests_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
