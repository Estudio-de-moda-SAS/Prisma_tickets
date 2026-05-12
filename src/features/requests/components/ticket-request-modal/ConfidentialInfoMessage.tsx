import type { ConfidentialInfoConfig } from "./ticketFormTypes";

type ConfidentialInfoMessageProps = {
  info: ConfidentialInfoConfig;
};

export function ConfidentialInfoMessage({ info }: ConfidentialInfoMessageProps) {
  const parts = info.highlightedText
    ? info.message.split(info.highlightedText)
    : [info.message];

  return (
    <div className="create-ticket-modal__confidential-info">
      <span className="create-ticket-modal__confidential-icon">!</span>

      <p>
        {info.highlightedText ? (
          <>
            {parts[0]}
            <strong>{info.highlightedText}</strong>
            {parts[1]}
          </>
        ) : (
          info.message
        )}
      </p>
    </div>
  );
}