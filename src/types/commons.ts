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
  team: {
    Team_Code: string;
    Team_Name: string;
  } | null;
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