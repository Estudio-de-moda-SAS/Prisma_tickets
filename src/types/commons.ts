// src/types/commons.ts

export type PageResult<T> = {
  items: T[];
  nextLink: string | null;
};

export type GetAllOpts = {
  filter?: string;
  orderby?: string;
  top?: number;
};

export type Department = {
  Department_ID:   number;
  Department_Name: string;
  Department_Code: string;
};

export type Team = {
  Team_ID:       number;
  Team_Name:     string;
  Team_Code:     string;
  Department_ID: number;
};

export type UserProfile = {
  User_ID:       number;
  User_Name:     string;
  User_Email:    string;
  User_Role:     string;
  Department_ID: number | null;
  Team_ID:       number | null;
  Is_New:        boolean;
  Is_Active:     boolean;
  team: {
    Team_Code: string;
    Team_Name: string;
  } | null;
  department?: { Department_ID: number; Department_Name: string; Department_Code: string } | null;
};

/* ── Criterios de aceptación ── */
export type AcceptanceCriteriaStatus = 'pending' | 'accepted' | 'rejected';

export type AcceptanceCriteria = {
  criteriaId:    number;
  requestId:     string;
  title:         string;
  status:        AcceptanceCriteriaStatus;
  reviewerNotes: string | null;
  reviewedBy:    number | null;
  reviewedAt:    string | null;
  createdAt:     string;
  updatedAt:     string;
};

/* ── Notificaciones ── */
export type NotificationType =
  | 'assignment'
  | 'comment'
  | 'column_move'
  | 'closure'
  | 'criteria_reviewed'
  | 'sub_request_created'
  | 'mention'
  | 'export_ready';

export type Notification = {
  notificationId: number;
  type:           NotificationType;
  title:          string;
  body:           string | null;
  requestId:      string | null;
  isRead:         boolean;
  createdAt:      string;
  actor: {
    userId:    number;
    userName:  string;
    avatarUrl: string;
  } | null;
};