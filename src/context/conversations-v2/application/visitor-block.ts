import { VisitorV2Repository } from 'src/context/visitors-v2/domain/visitor-v2.repository';
import { VisitorId } from 'src/context/visitors-v2/domain/value-objects/visitor-id';
import { VisitorBlockedError } from 'src/context/visitors-v2/domain/errors/visitor-block.error';
import { Chat } from '../domain/entities/chat.aggregate';

/**
 * Rechaza chat, mensajes del visitante y captación si la empresa lo bloqueó.
 */
export async function assertVisitorNotBlocked(
  visitors: VisitorV2Repository,
  visitorId: string,
): Promise<void> {
  if (!visitorId) return;
  const result = await visitors.findById(new VisitorId(visitorId));
  if (result.isErr()) return;
  if (result.unwrap().isBlocked()) {
    throw new VisitorBlockedError();
  }
}

/**
 * Saca de Pendientes y Míos los chats de visitantes bloqueados.
 */
export async function withoutBlockedVisitors(
  visitors: VisitorV2Repository,
  chats: Chat[],
): Promise<Chat[]> {
  if (chats.length === 0) return chats;
  const ids = [...new Set(chats.map((chat) => chat.visitorId.getValue()))];
  const blocked = new Set(await visitors.findBlockedIds(ids));
  if (blocked.size === 0) return chats;
  return chats.filter((chat) => !blocked.has(chat.visitorId.getValue()));
}
