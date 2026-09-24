import { QueryBus } from '@nestjs/cqrs';
import { FindUserByIdQuery } from 'src/context/auth/auth-user/application/queries/find-user-by-id.query';
import { UserAccount } from 'src/context/auth/auth-user/domain/user-account.aggregate';
import { BffSessionData } from '../../domain/value-objects/bff-session-data';
import {
  EmbedSessionPrincipal,
  ResolveEmbedSessionQuery,
  toEmbedSessionPrincipal,
} from './resolve-embed-session.query';

export function readCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  const part = cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith(prefix));
  if (!part) return undefined;
  try {
    return decodeURIComponent(part.slice(prefix.length));
  } catch {
    return part.slice(prefix.length);
  }
}

/**
 * Cookie `access_token` (id opaco de Redis) → usuario de Console.
 * `sub` es el keycloakId cuando existe, para que Atención use el mismo
 * comercial que el login directo.
 */
export async function loadEmbedSessionPrincipal(
  queryBus: QueryBus,
  sessionId: string | undefined,
): Promise<EmbedSessionPrincipal | null> {
  if (!sessionId) return null;
  const session = await queryBus.execute<
    ResolveEmbedSessionQuery,
    BffSessionData | null
  >(new ResolveEmbedSessionQuery(sessionId));
  if (!session) return null;

  const user = await queryBus.execute<FindUserByIdQuery, UserAccount | null>(
    new FindUserByIdQuery(session.userId),
  );
  if (!user || user.companyId.value !== session.companyId) return null;
  return toEmbedSessionPrincipal(user, session.expiresAt);
}
