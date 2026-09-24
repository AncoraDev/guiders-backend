import { UserAccount } from 'src/context/auth/auth-user/domain/user-account.aggregate';
import { UserAccountEmail } from 'src/context/auth/auth-user/domain/user-account-email';
import { UserAccountName } from 'src/context/auth/auth-user/domain/value-objects/user-account-name';
import { UserAccountPassword } from 'src/context/auth/auth-user/domain/user-account-password';
import { UserAccountCompanyId } from 'src/context/auth/auth-user/domain/value-objects/user-account-company-id';
import { UserAccountRoles } from 'src/context/auth/auth-user/domain/value-objects/user-account-roles';
import { UserAccountKeycloakId } from 'src/context/auth/auth-user/domain/value-objects/user-account-keycloak-id';
import { Role } from 'src/context/auth/auth-user/domain/value-objects/role';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { toEmbedSessionPrincipal } from '../resolve-embed-session.query';

describe('toEmbedSessionPrincipal', () => {
  const companyId = Uuid.random().value;

  it('usa el keycloakId como sub cuando la cuenta también entra por login directo', () => {
    const keycloakId = Uuid.random().value;
    const user = UserAccount.create({
      email: new UserAccountEmail('ana@concesionario.es'),
      name: new UserAccountName('Ana'),
      password: UserAccountPassword.empty(),
      roles: UserAccountRoles.fromRoles([Role.commercial()]),
      companyId: new UserAccountCompanyId(companyId),
      keycloakId: UserAccountKeycloakId.fromString(keycloakId),
    });

    const principal = toEmbedSessionPrincipal(user, '2026-09-24T18:00:00.000Z');

    expect(principal?.sub).toBe(keycloakId);
    expect(principal?.companyId).toBe(companyId);
    expect(principal?.roles).toContain('commercial');
    expect(principal?.exp).toBe(
      Math.floor(new Date('2026-09-24T18:00:00.000Z').getTime() / 1000),
    );
  });

  it('usa el UUID de Guiders cuando no hay Keycloak y rechaza cuentas inactivas', () => {
    const user = UserAccount.create({
      email: new UserAccountEmail('ana@concesionario.es'),
      name: new UserAccountName('Ana'),
      password: UserAccountPassword.empty(),
      roles: UserAccountRoles.fromRoles([Role.commercial()]),
      companyId: new UserAccountCompanyId(companyId),
    });

    expect(toEmbedSessionPrincipal(user)?.sub).toBe(user.id.value);
    expect(toEmbedSessionPrincipal(user.deactivate())).toBeNull();
  });
});
