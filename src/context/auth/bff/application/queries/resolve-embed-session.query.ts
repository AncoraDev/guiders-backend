import { UserAccount } from 'src/context/auth/auth-user/domain/user-account.aggregate';

export class ResolveEmbedSessionQuery {
  constructor(public readonly sessionId: string) {}
}

/** Identidad que Console usa como `sub` (Keycloak si existe, si no el UUID de Guiders). */
export interface EmbedSessionPrincipal {
  sub: string;
  email: string;
  roles: string[];
  companyId: string;
  username: string;
  exp?: number;
}

export function toEmbedSessionPrincipal(
  user: UserAccount,
  expiresAt?: string,
): EmbedSessionPrincipal | null {
  if (!user.isActive) return null;
  const primitives = user.toPrimitives();
  const exp = expiresAt
    ? Math.floor(new Date(expiresAt).getTime() / 1000)
    : undefined;
  return {
    sub: primitives.keycloakId ?? primitives.id,
    email: primitives.email,
    roles: primitives.roles,
    companyId: primitives.companyId,
    username: primitives.name || primitives.email.split('@')[0] || 'comercial',
    exp: Number.isFinite(exp) ? exp : undefined,
  };
}
