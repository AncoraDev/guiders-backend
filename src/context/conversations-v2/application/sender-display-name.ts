import { CommercialRepository } from 'src/context/commercial/domain/commercial.repository';
import { CommercialId } from 'src/context/commercial/domain/value-objects/commercial-id';

const ANONYMOUS_SENDERS = new Set(['system', 'ai']);

/**
 * Nombre visible del comercial que escribió, el mismo que usa la pastilla
 * de traslado. Sistema, IA y quien no tiene perfil comercial no aportan nombre.
 */
export async function senderDisplayNames(
  commercials: CommercialRepository,
  senderIds: string[],
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(
      senderIds
        .map((id) => id.trim())
        .filter(
          (id) => id.length > 0 && !ANONYMOUS_SENDERS.has(id.toLowerCase()),
        ),
    ),
  ];

  const pairs = await Promise.all(
    unique.map(async (id) => {
      try {
        const result = await commercials.findById(new CommercialId(id));
        if (result.isErr()) return null;
        const name = result.unwrap()?.name.value?.trim();
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
