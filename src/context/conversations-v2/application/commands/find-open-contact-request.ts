export interface ContactRequestLike {
  systemData?: {
    action?: string;
    status?: string;
    requestId?: string;
  } | null;
}

export function findOpenContactRequest<T extends ContactRequestLike>(
  messages: T[],
): T | undefined {
  const closedIds = new Set(
    messages
      .filter((message) => {
        const action = message.systemData?.action;
        return (
          action === 'contact_submission' ||
          action === 'contact_cancellation' ||
          action === 'contact_confirmation'
        );
      })
      .map((message) => message.systemData?.requestId)
      .filter((id): id is string => !!id),
  );

  return messages.find((message) => {
    const data = message.systemData;
    return (
      data?.action === 'contact_request' &&
      data.status === 'pending' &&
      !!data.requestId &&
      !closedIds.has(data.requestId)
    );
  });
}
