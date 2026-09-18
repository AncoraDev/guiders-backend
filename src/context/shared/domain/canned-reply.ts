import { Uuid } from './value-objects/uuid';

export interface CannedReplyPrimitives {
  id: string;
  title: string;
  body: string;
}

export const CANNED_REPLY_TITLE_MAX = 40;
export const CANNED_REPLY_BODY_MAX = 500;
export const USER_CANNED_REPLIES_MAX = 15;
export const COMPANY_CANNED_REPLIES_MAX = 20;

/**
 * Valida y normaliza frases rápidas. Lanza Error con mensaje en español.
 */
export function parseCannedReplies(
  raw: unknown,
  maxItems: number,
): CannedReplyPrimitives[] {
  if (raw == null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error('Las frases deben ser una lista');
  }
  if (raw.length > maxItems) {
    throw new Error(`No puedes guardar más de ${maxItems} frases`);
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`La frase ${index + 1} no es válida`);
    }
    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const body = typeof record.body === 'string' ? record.body.trim() : '';

    if (!title) {
      throw new Error(`La frase ${index + 1} necesita un título`);
    }
    if (!body) {
      throw new Error(`La frase ${index + 1} necesita un texto`);
    }
    if (title.length > CANNED_REPLY_TITLE_MAX) {
      throw new Error(
        `El título no puede superar ${CANNED_REPLY_TITLE_MAX} caracteres`,
      );
    }
    if (body.length > CANNED_REPLY_BODY_MAX) {
      throw new Error(
        `El texto no puede superar ${CANNED_REPLY_BODY_MAX} caracteres`,
      );
    }

    const rawId = typeof record.id === 'string' ? record.id.trim() : '';
    const id = Uuid.validate(rawId) ? rawId : Uuid.random().value;

    return { id, title, body };
  });
}
