import { Chat } from '../domain/entities/chat.aggregate';

/**
 * Comercial asignado de un chat ASSIGNED o ACTIVE.
 * null si no hay dueño o el chat no está en cobertura.
 */
export function openAssigneeId(chat: Chat): string | null {
  const status = chat.status.value;
  if (status !== 'ASSIGNED' && status !== 'ACTIVE') return null;
  if (!chat.assignedCommercialId.isPresent()) return null;
  return chat.assignedCommercialId.get().getValue();
}
