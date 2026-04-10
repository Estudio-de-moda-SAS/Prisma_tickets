import * as React from "react";
import { useTicketAttachmentData } from "./useTicketAttachmentData";
import { useExplorerActions } from "./useTicketAttachmentAction";


export function useTicketAttachment() {
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const { load } = useTicketAttachmentData({ setLoading, setError });

  const actions = useExplorerActions();

  return {
    loading,
    error,
    reload: load,
    ...actions,
  };
}