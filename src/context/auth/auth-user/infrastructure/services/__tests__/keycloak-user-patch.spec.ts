import { buildKeycloakUserPatch } from '../keycloak-admin.service';

describe('buildKeycloakUserPatch', () => {
  const user = {
    id: 'kc-1',
    username: 'admin@rmotion.com',
    email: 'nuevo@demo.com',
    firstName: 'Ana',
    lastName: 'Admin',
    enabled: true,
    emailVerified: false,
  };

  it('alinea el username con el email de Guiders cuando se quedaron distintos', () => {
    const patch = buildKeycloakUserPatch(user, { email: 'nuevo@demo.com' });

    expect(patch.username).toBe('nuevo@demo.com');
    expect(patch.email).toBe('nuevo@demo.com');
    expect(patch.emailVerified).toBe(true);
  });

  it('deja el username si ya coincide con el email', () => {
    const patch = buildKeycloakUserPatch(
      { ...user, username: 'nuevo@demo.com', email: 'nuevo@demo.com' },
      { email: 'nuevo@demo.com' },
    );

    expect(patch.username).toBe('nuevo@demo.com');
    expect(patch.email).toBe('nuevo@demo.com');
  });
});
