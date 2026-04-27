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
      TBL_Attachments: {
        Row: {
          Attachment_Created_At: string
          Attachment_File_Name: string
          Attachment_File_Size: number
          Attachment_File_url: string
          Attachment_ID: number
          Attachment_Mime_Type: string
          Attachment_Request_ID: number
          Attachment_Uploaded_By: number
        }
        Insert: {
          Attachment_Created_At: string
          Attachment_File_Name: string
          Attachment_File_Size: number
          Attachment_File_url: string
          Attachment_ID?: number
          Attachment_Mime_Type: string
          Attachment_Request_ID: number
          Attachment_Uploaded_By: number
        }
        Update: {
          Attachment_Created_At?: string
          Attachment_File_Name?: string
          Attachment_File_Size?: number
          Attachment_File_url?: string
          Attachment_ID?: number
          Attachment_Mime_Type?: string
          Attachment_Request_ID?: number
          Attachment_Uploaded_By?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Attachments_Attachment_Request_ID_fkey"
            columns: ["Attachment_Request_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
          {
            foreignKeyName: "TBL_Attachments_Attachment_Uploaded_By_fkey"
            columns: ["Attachment_Uploaded_By"]
            isOneToOne: false
            referencedRelation: "TBL_Users"
            referencedColumns: ["User_ID"]
          },
        ]
      }
      TBL_Board_Columns: {
        Row: {
          Board_Column_Board_ID: number
          Board_Column_Color: string
          Board_Column_ID: number
          Board_Column_Limit: number
          Board_Column_Name: string
          Board_Column_Position: number
        }
        Insert: {
          Board_Column_Board_ID: number
          Board_Column_Color: string
          Board_Column_ID?: number
          Board_Column_Limit: number
          Board_Column_Name: string
          Board_Column_Position: number
        }
        Update: {
          Board_Column_Board_ID?: number
          Board_Column_Color?: string
          Board_Column_ID?: number
          Board_Column_Limit?: number
          Board_Column_Name?: string
          Board_Column_Position?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Board_Columns_Board_Column_Board_ID_fkey"
            columns: ["Board_Column_Board_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Boards"
            referencedColumns: ["Board_ID"]
          },
        ]
      }
      TBL_Board_Teams: {
        Row: {
          Board_Team_Code: string
          Board_Team_Color: string
          Board_Team_ID: number
          Board_Team_Name: string
        }
        Insert: {
          Board_Team_Code: string
          Board_Team_Color: string
          Board_Team_ID?: number
          Board_Team_Name: string
        }
        Update: {
          Board_Team_Code?: string
          Board_Team_Color?: string
          Board_Team_ID?: number
          Board_Team_Name?: string
        }
        Relationships: []
      }
      TBL_Boards: {
        Row: {
          Board_Created_At: string
          Board_Description: string
          Board_ID: number
          Board_Name: string
          Board_Owner_ID: number
          Board_User_ID: number
        }
        Insert: {
          Board_Created_At: string
          Board_Description: string
          Board_ID?: number
          Board_Name: string
          Board_Owner_ID: number
          Board_User_ID: number
        }
        Update: {
          Board_Created_At?: string
          Board_Description?: string
          Board_ID?: number
          Board_Name?: string
          Board_Owner_ID?: number
          Board_User_ID?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Boards_Board_Owner_ID_fkey"
            columns: ["Board_Owner_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Users"
            referencedColumns: ["User_ID"]
          },
        ]
      }
      TBL_Comments: {
        Row: {
          Comment_Created_At: string
          Comment_ID: number
          Comment_Request_ID: number
          Comment_Text: string
          Comment_User_ID: number
        }
        Insert: {
          Comment_Created_At: string
          Comment_ID?: number
          Comment_Request_ID: number
          Comment_Text: string
          Comment_User_ID: number
        }
        Update: {
          Comment_Created_At?: string
          Comment_ID?: number
          Comment_Request_ID?: number
          Comment_Text?: string
          Comment_User_ID?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Comments_Comment_Request_ID_fkey"
            columns: ["Comment_Request_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
          {
            foreignKeyName: "TBL_Comments_Comment_User_ID_fkey"
            columns: ["Comment_User_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Users"
            referencedColumns: ["User_ID"]
          },
        ]
      }
      TBL_Email_Logs: {
        Row: {
          Email_Log_Body_Sent: string
          Email_Log_ID: number
          Email_Log_Request_ID: number
          Email_Log_Sent_At: string
          Email_Log_Sent_To: number
          Email_Log_Status: string
          Email_Log_Subject_Sent: string
          Email_Log_Template_Name: string
        }
        Insert: {
          Email_Log_Body_Sent: string
          Email_Log_ID?: number
          Email_Log_Request_ID: number
          Email_Log_Sent_At: string
          Email_Log_Sent_To: number
          Email_Log_Status: string
          Email_Log_Subject_Sent: string
          Email_Log_Template_Name: string
        }
        Update: {
          Email_Log_Body_Sent?: string
          Email_Log_ID?: number
          Email_Log_Request_ID?: number
          Email_Log_Sent_At?: string
          Email_Log_Sent_To?: number
          Email_Log_Status?: string
          Email_Log_Subject_Sent?: string
          Email_Log_Template_Name?: string
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Email_Logs_Email_Log_Request_ID_fkey"
            columns: ["Email_Log_Request_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
          {
            foreignKeyName: "TBL_Email_Logs_Email_Log_Sent_To_fkey"
            columns: ["Email_Log_Sent_To"]
            isOneToOne: false
            referencedRelation: "TBL_Users"
            referencedColumns: ["User_ID"]
          },
        ]
      }
      TBL_Email_Templates: {
        Row: {
          Email_Template_Board_ID: number
          Email_Template_Body_html: string
          Email_Template_Body_Text: string
          Email_Template_Created_At: string
          Email_Template_ID: number
          Email_Template_Name: string
          Email_Template_Subject: string
          Email_Template_Updated_At: string
        }
        Insert: {
          Email_Template_Board_ID: number
          Email_Template_Body_html: string
          Email_Template_Body_Text: string
          Email_Template_Created_At: string
          Email_Template_ID?: number
          Email_Template_Name: string
          Email_Template_Subject: string
          Email_Template_Updated_At: string
        }
        Update: {
          Email_Template_Board_ID?: number
          Email_Template_Body_html?: string
          Email_Template_Body_Text?: string
          Email_Template_Created_At?: string
          Email_Template_ID?: number
          Email_Template_Name?: string
          Email_Template_Subject?: string
          Email_Template_Updated_At?: string
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Email_Templates_Email_Template_Board_ID_fkey"
            columns: ["Email_Template_Board_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Boards"
            referencedColumns: ["Board_ID"]
          },
        ]
      }
      TBL_Labels: {
        Row: {
          Label_Board_ID: number
          Label_Color: string
          Label_Icon: string
          Label_ID: number
          Label_Name: string
        }
        Insert: {
          Label_Board_ID: number
          Label_Color: string
          Label_Icon: string
          Label_ID?: number
          Label_Name: string
        }
        Update: {
          Label_Board_ID?: number
          Label_Color?: string
          Label_Icon?: string
          Label_ID?: number
          Label_Name?: string
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Labels_Label_Board_ID_fkey"
            columns: ["Label_Board_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Boards"
            referencedColumns: ["Board_ID"]
          },
        ]
      }
      TBL_Request_CRM_Example: {
        Row: {
          Request_CRM_Example_Request_ID: number
          Request_CRM_Example_Store_Name: string
        }
        Insert: {
          Request_CRM_Example_Request_ID: number
          Request_CRM_Example_Store_Name: string
        }
        Update: {
          Request_CRM_Example_Request_ID?: number
          Request_CRM_Example_Store_Name?: string
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Request_CRM_Example_Request_CRM_Example_Request_ID_fkey"
            columns: ["Request_CRM_Example_Request_ID"]
            isOneToOne: true
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
        ]
      }
      TBL_Request_Labels: {
        Row: {
          Request_Labels_Label_ID: number
          Request_Labels_Request_ID: number
        }
        Insert: {
          Request_Labels_Label_ID: number
          Request_Labels_Request_ID: number
        }
        Update: {
          Request_Labels_Label_ID?: number
          Request_Labels_Request_ID?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Request_Labels_Request_Labels_Label_ID_fkey"
            columns: ["Request_Labels_Label_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Labels"
            referencedColumns: ["Label_ID"]
          },
          {
            foreignKeyName: "TBL_Request_Labels_Request_Labels_Request_ID_fkey"
            columns: ["Request_Labels_Request_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
        ]
      }
      TBL_Request_Sprint: {
        Row: {
          Request_Sprint_ID: number
          Request_Sprint_Request_ID: number
        }
        Insert: {
          Request_Sprint_ID: number
          Request_Sprint_Request_ID: number
        }
        Update: {
          Request_Sprint_ID?: number
          Request_Sprint_Request_ID?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Request_Sprint_Request_Sprint_ID_fkey"
            columns: ["Request_Sprint_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Sprint"
            referencedColumns: ["Sprint_ID"]
          },
          {
            foreignKeyName: "TBL_Request_Sprint_Request_Sprint_Request_ID_fkey"
            columns: ["Request_Sprint_Request_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
        ]
      }
      TBL_Request_Team: {
        Row: {
          Request_Team_ID: number
          Request_Team_Request_ID: number
        }
        Insert: {
          Request_Team_ID: number
          Request_Team_Request_ID: number
        }
        Update: {
          Request_Team_ID?: number
          Request_Team_Request_ID?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Request_Team_Request_Team_ID_fkey"
            columns: ["Request_Team_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Board_Teams"
            referencedColumns: ["Board_Team_ID"]
          },
          {
            foreignKeyName: "TBL_Request_Team_Request_Team_Request_ID_fkey"
            columns: ["Request_Team_Request_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
        ]
      }
      TBL_Requests: {
        Row: {
          Request_Board_Column_ID: number
          Request_Board_ID: number
          Request_Created_At: string | null
          Request_Deadline: string | null
          Request_Description: string | null
          Request_Finished_At: string | null
          Request_ID: number
          Request_Progress: number | null
          Request_Requested_By: number
          Request_Score: number | null
          Request_Template_ID: number
          Request_Time_Consumed: string | null
          Request_Title: string | null
        }
        Insert: {
          Request_Board_Column_ID: number
          Request_Board_ID: number
          Request_Created_At?: string | null
          Request_Deadline?: string | null
          Request_Description?: string | null
          Request_Finished_At?: string | null
          Request_ID?: number
          Request_Progress?: number | null
          Request_Requested_By: number
          Request_Score?: number | null
          Request_Template_ID: number
          Request_Time_Consumed?: string | null
          Request_Title?: string | null
        }
        Update: {
          Request_Board_Column_ID?: number
          Request_Board_ID?: number
          Request_Created_At?: string | null
          Request_Deadline?: string | null
          Request_Description?: string | null
          Request_Finished_At?: string | null
          Request_ID?: number
          Request_Progress?: number | null
          Request_Requested_By?: number
          Request_Score?: number | null
          Request_Template_ID?: number
          Request_Time_Consumed?: string | null
          Request_Title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Requests_Request_Board_Column_ID_fkey"
            columns: ["Request_Board_Column_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Board_Columns"
            referencedColumns: ["Board_Column_ID"]
          },
          {
            foreignKeyName: "TBL_Requests_Request_Board_ID_fkey"
            columns: ["Request_Board_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Boards"
            referencedColumns: ["Board_ID"]
          },
          {
            foreignKeyName: "TBL_Requests_Request_Requested_By_fkey"
            columns: ["Request_Requested_By"]
            isOneToOne: false
            referencedRelation: "TBL_Users"
            referencedColumns: ["User_ID"]
          },
          {
            foreignKeyName: "TBL_Requests_Request_Template_ID_fkey"
            columns: ["Request_Template_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests_Templates"
            referencedColumns: ["Request_Template_ID"]
          },
        ]
      }
      TBL_Requests_Assignments: {
        Row: {
          Request_Assignment_At: string
          Request_Assignment_ID: number
          Request_Assignment_User_ID: number
        }
        Insert: {
          Request_Assignment_At: string
          Request_Assignment_ID: number
          Request_Assignment_User_ID: number
        }
        Update: {
          Request_Assignment_At?: string
          Request_Assignment_ID?: number
          Request_Assignment_User_ID?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Requests_Assignments_Request_Assignment_ID_fkey"
            columns: ["Request_Assignment_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
          {
            foreignKeyName: "TBL_Requests_Assignments_Request_Assignment_User_ID_fkey"
            columns: ["Request_Assignment_User_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Users"
            referencedColumns: ["User_ID"]
          },
        ]
      }
      TBL_Requests_History: {
        Row: {
          Request_History_Changed_At: string
          Request_History_Changed_By: number
          Request_History_Field: string
          Request_History_ID: number
          Request_History_New_Value: string
          Request_History_Old_Value: string
          Request_History_Request_ID: number
        }
        Insert: {
          Request_History_Changed_At: string
          Request_History_Changed_By: number
          Request_History_Field: string
          Request_History_ID?: number
          Request_History_New_Value: string
          Request_History_Old_Value: string
          Request_History_Request_ID: number
        }
        Update: {
          Request_History_Changed_At?: string
          Request_History_Changed_By?: number
          Request_History_Field?: string
          Request_History_ID?: number
          Request_History_New_Value?: string
          Request_History_Old_Value?: string
          Request_History_Request_ID?: number
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Requests_History_Request_History_Changed_By_fkey"
            columns: ["Request_History_Changed_By"]
            isOneToOne: false
            referencedRelation: "TBL_Users"
            referencedColumns: ["User_ID"]
          },
          {
            foreignKeyName: "TBL_Requests_History_Request_History_Request_ID_fkey"
            columns: ["Request_History_Request_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Requests"
            referencedColumns: ["Request_ID"]
          },
        ]
      }
      TBL_Requests_Templates: {
        Row: {
          Request_Template_Board_ID: number
          Request_Template_Created_At: string
          Request_Template_Description: string
          Request_Template_ID: number
          Request_Template_Name: string
        }
        Insert: {
          Request_Template_Board_ID: number
          Request_Template_Created_At: string
          Request_Template_Description: string
          Request_Template_ID?: number
          Request_Template_Name: string
        }
        Update: {
          Request_Template_Board_ID?: number
          Request_Template_Created_At?: string
          Request_Template_Description?: string
          Request_Template_ID?: number
          Request_Template_Name?: string
        }
        Relationships: [
          {
            foreignKeyName: "TBL_Requests_Templates_Request_Template_Board_ID_fkey"
            columns: ["Request_Template_Board_ID"]
            isOneToOne: false
            referencedRelation: "TBL_Boards"
            referencedColumns: ["Board_ID"]
          },
        ]
      }
      TBL_Sprint: {
        Row: {
          Sprint_End_Date: string
          Sprint_ID: number
          Sprint_Start_Date: string
          Sprint_Text: string
        }
        Insert: {
          Sprint_End_Date: string
          Sprint_ID?: number
          Sprint_Start_Date: string
          Sprint_Text: string
        }
        Update: {
          Sprint_End_Date?: string
          Sprint_ID?: number
          Sprint_Start_Date?: string
          Sprint_Text?: string
        }
        Relationships: []
      }
      TBL_Users: {
        Row: {
          User_Avatar_url: string
          User_Created_At: string
          User_Email: string
          User_EntraID: string
          User_ID: number
          User_Name: string
          User_Role: string
        }
        Insert: {
          User_Avatar_url: string
          User_Created_At: string
          User_Email: string
          User_EntraID: string
          User_ID?: number
          User_Name: string
          User_Role: string
        }
        Update: {
          User_Avatar_url?: string
          User_Created_At?: string
          User_Email?: string
          User_EntraID?: string
          User_ID?: number
          User_Name?: string
          User_Role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
