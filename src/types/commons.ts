export type PageResult<T> = {
  items: T[];
  nextLink: string | null;
};

export type GetAllOpts = {
  filter?: string;
  orderby?: string;
  top?: number;
};
