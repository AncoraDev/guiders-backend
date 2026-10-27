import { senderDisplayNames } from '../sender-display-name';
import { UserAccountRepository } from 'src/context/auth/auth-user/domain/user-account.repository';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('senderDisplayNames', () => {
  const adminId = Uuid.random().value;
  const mariaId = Uuid.random().value;

  it('devuelve el nombre de la cuenta y omite sistema y visitante', async () => {
    const users = {
      findById: jest.fn(async (id: string) => {
        if (id === adminId) return { name: { getValue: () => 'Admin User' } };
        if (id === mariaId) return { name: { getValue: () => 'MARIA' } };
        return null;
      }),
    };

    const names = await senderDisplayNames(
      users as unknown as UserAccountRepository,
      [adminId, 'system', mariaId, 'ai', Uuid.random().value],
    );

    expect(names.get(adminId)).toBe('Admin User');
    expect(names.get(mariaId)).toBe('MARIA');
    expect(names.size).toBe(2);
    expect(users.findById).not.toHaveBeenCalledWith('system');
    expect(users.findById).not.toHaveBeenCalledWith('ai');
  });
});
