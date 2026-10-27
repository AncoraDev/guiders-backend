import { IChatRepository } from '../../domain/chat.repository';
import { Chat } from '../../domain/entities/chat.aggregate';
import { ChatStatus } from '../../domain/value-objects/chat-status';
import { VisitorId } from '../../domain/value-objects/visitor-id';

const OPEN_CHAT_STATUSES: ChatStatus[] = [
  ChatStatus.PENDING,
  ChatStatus.ASSIGNED,
  ChatStatus.ACTIVE,
  ChatStatus.TRANSFERRED,
];

export interface OpenChatDecision {
  chat: Chat | null;
  blocked: boolean;
}

function assigneeId(chat: Chat): string | null {
  return chat.assignedCommercialId.isPresent()
    ? chat.assignedCommercialId.get().getValue()
    : null;
}

function newest(chats: Chat[]): Chat {
  return chats.reduce((latest, chat) =>
    chat.updatedAt.getTime() >= latest.updatedAt.getTime() ? chat : latest,
  );
}

/**
 * Chat abierto del visitante que hay que reutilizar, o bloqueo si ya lo
 * atiende otro comercial. El propio visitante nunca queda bloqueado: se
 * queda en el hilo que ya tiene (el asignado, si existe).
 */
export async function resolveOpenChat(
  chatRepository: IChatRepository,
  visitorId: string,
  actorId: string,
  companyId?: string,
): Promise<OpenChatDecision> {
  const found = await chatRepository.findByVisitorId(
    VisitorId.create(visitorId),
    OPEN_CHAT_STATUSES,
  );
  if (found.isErr()) {
    throw found.error;
  }

  const open = found.unwrap().filter((chat) => {
    if (!companyId) return true;
    return chat.companyId === companyId;
  });
  if (open.length === 0) {
    return { chat: null, blocked: false };
  }

  const mine = open.find((chat) => assigneeId(chat) === actorId);
  if (mine) {
    return { chat: mine, blocked: false };
  }

  if (actorId === visitorId) {
    const attended = open
      .filter((chat) => assigneeId(chat))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return {
      chat: attended[0] ?? newest(open),
      blocked: false,
    };
  }

  const takenByOther = open.find((chat) => {
    const assignee = assigneeId(chat);
    return !!assignee && assignee !== actorId;
  });
  if (takenByOther) {
    return { chat: takenByOther, blocked: true };
  }

  const unassigned = open.find((chat) => !assigneeId(chat));
  return {
    chat: unassigned ?? newest(open),
    blocked: false,
  };
}
