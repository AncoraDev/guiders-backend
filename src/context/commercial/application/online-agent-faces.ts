import { CommercialConnectionDomainService } from '../domain/commercial-connection.domain-service';
import { CommercialId } from '../domain/value-objects/commercial-id';
import { CommercialRepository } from '../domain/commercial.repository';

/** Cara pública de un comercial online. Sin identificadores internos. */
export interface OnlineAgentFace {
  name: string;
  avatarUrl: string | null;
}

export async function facesForCommercials(
  commercialRepository: CommercialRepository,
  ids: CommercialId[],
): Promise<OnlineAgentFace[]> {
  const faces: OnlineAgentFace[] = [];
  for (const id of ids) {
    const found = await commercialRepository.findById(id);
    if (found.isErr()) continue;
    const commercial = found.unwrap();
    if (!commercial) continue;
    const name = commercial.name.value?.trim();
    if (!name) continue;
    faces.push({
      name,
      avatarUrl: commercial.avatarUrl ?? null,
    });
  }
  return faces;
}

/**
 * Comerciales disponibles del tenant, con nombre y avatar, para la cabecera
 * del chat cuando el visitante aún no tiene a nadie asignado.
 */
export async function listOnlineAgentFaces(
  connectionService: CommercialConnectionDomainService,
  commercialRepository: CommercialRepository,
  companyId: string,
): Promise<OnlineAgentFace[]> {
  try {
    const ids = await connectionService.getAvailableCommercials(companyId);
    return await facesForCommercials(commercialRepository, ids);
  } catch {
    return [];
  }
}
