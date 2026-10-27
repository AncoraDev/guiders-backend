import { UserAccountRepository } from 'src/context/auth/auth-user/domain/user-account.repository';

const ANONYMOUS_SENDERS = new Set(['system', 'ai']);

/**
 * Nombre visible de quien escribió el mensaje, el mismo de su cuenta.
 * Quien no es una cuenta (sistema, visitante, IA) no aporta nombre.
 */
export async function senderDisplayNames(
  users: UserAccountRepository,
  senderIds: string[],
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(
      senderIds
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && !ANONYMOUS_SENDERS.has(id.toLowerCase())),
    ),
  ];

  const pairs = await Promise.all(
    unique.map(async (id) => {
      try {
        const user = await users.findById(id);
        const name = user?.name.getValue()?.trim();
        return name ? ([id, name] as const) : null;
      } catch {
        return null;
      }
    }),
  );

  return new Map(
    pairs.filter((pair): pair is readonly [string, string] => pair !== null),
  );
}
