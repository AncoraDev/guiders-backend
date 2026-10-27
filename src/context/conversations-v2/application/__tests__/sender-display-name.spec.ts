import { senderDisplayNames } from '../sender-display-name';
import { CommercialRepository } from 'src/context/commercial/domain/commercial.repository';
import { ok } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('senderDisplayNames', () => {
  const adminId = Uuid.random().value;
  const mariaId = Uuid.random().value;

  it('devuelve el nombre del perfil comercial y omite sistema e IA', async () => {
    const commercials = {
      findById: jest.fn(async (id: { value: string }) => {
        if (id.value === adminId) return ok({ name: { value: 'Admin User' } });
        if (id.value === mariaId) return ok({ name: { value: 'MARIA' } });
        return ok(null);
      }),
    };

    const names = await senderDisplayNames(
      commercials as unknown as CommercialRepository,
      [adminId, 'system', mariaId, 'ai', Uuid.random().value],
    );

    expect(names.get(adminId)).toBe('Admin User');
    expect(names.get(mariaId)).toBe('MARIA');
    expect(names.size).toBe(2);
    expect(commercials.findById).not.toHaveBeenCalledWith(
      expect.objectContaining({ value: 'system' }),
    );
  });

  it('ignora un perfil sin nombre y un id que no es de comercial', async () => {
    const unknown = Uuid.random().value;
    const commercials = {
      findById: jest.fn(async () => ({
        isErr: () => true,
        isOk: () => false,
      })),
    };

    const names = await senderDisplayNames(
      commercials as unknown as CommercialRepository,
      [unknown, 'no-es-uuid'],
    );

    expect(names.size).toBe(0);
  });
});
