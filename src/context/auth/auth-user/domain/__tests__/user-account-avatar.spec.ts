import { UserAccount } from '../user-account.aggregate';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('UserAccount.updateAvatar', () => {
  it('deja el evento en la cuenta que se guarda', () => {
    const user = UserAccount.fromPrimitives({
      id: Uuid.random().value,
      email: 'alberto@example.com',
      name: 'ALBERTO',
      password: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: ['commercial'],
      companyId: Uuid.random().value,
      keycloakId: Uuid.random().value,
      avatarUrl: 'https://cdn.example.com/old.png',
    });

    const updated = user.updateAvatar('https://cdn.example.com/new.png');

    expect(updated.getUncommittedEvents()).toHaveLength(1);
    expect(updated.getUncommittedEvents()[0]).toEqual(
      expect.objectContaining({
        avatarUrl: 'https://cdn.example.com/new.png',
      }),
    );
    expect(user.getUncommittedEvents()).toHaveLength(0);
  });
});
