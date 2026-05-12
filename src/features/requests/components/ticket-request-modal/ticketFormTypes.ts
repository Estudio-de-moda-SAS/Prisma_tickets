export type DropdownOption = {
  label: string;
  value: string;
  color?:
    | "yellow"
    | "pink"
    | "blue"
    | "green"
    | "cyan"
    | "orange"
    | "purple"
    | "red";
};

export type DropdownVariant = "pills" | "lines";

export type DropdownKey = string | null;

export type TicketFieldType = "text" | "textarea" | "select" | "radio" | "upload";

export type TicketField = {
  id: string;
  type: TicketFieldType;
  label: string;
  placeholder?: string;
  options?: DropdownOption[];
  variant?: DropdownVariant;
};

export type PriorityInfoColor = "red" | "orange" | "yellow" | "green";

export type PriorityInfoItem = {
  label: string;
  description: string;
  color: PriorityInfoColor;
};

export type PriorityInfoConfig = {
  title: string;
  items: PriorityInfoItem[];
};

export type ConfidentialInfoConfig = {
  message: string;
  highlightedText?: string;
};

export type TicketFormConfig = {
  id: string;
  title: string;
  fields: TicketField[];
  priorityInfo: PriorityInfoConfig;
  confidentialInfo: ConfidentialInfoConfig;
};