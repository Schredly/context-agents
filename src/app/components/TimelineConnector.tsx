interface TimelineConnectorProps {
  isLast?: boolean;
}

export function TimelineConnector({ isLast = false }: TimelineConnectorProps) {
  if (isLast) return null;

  return (
    <div className="absolute left-[19px] top-12 bottom-0 w-[2px] bg-gray-200" />
  );
}
