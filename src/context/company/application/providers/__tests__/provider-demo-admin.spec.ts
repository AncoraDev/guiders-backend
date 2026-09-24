import {
  demoAdminCredentialError,
  providerDemoAdminMatches,
} from '../provider-demo-admin';

describe('Acceso admin de la demo', () => {
  it('acepta el email y la contraseña guardados', () => {
    expect(
      providerDemoAdminMatches(
        'Admin@LeadCars.local',
        'password1',
        'admin@leadcars.local',
        'password1',
      ),
    ).toBe(true);
  });

  it('rechaza una contraseña distinta', () => {
    expect(
      providerDemoAdminMatches(
        'admin@leadcars.local',
        'password1',
        'admin@leadcars.local',
        'password2',
      ),
    ).toBe(false);
  });

  it('exige email y contraseña de al menos 8 caracteres', () => {
    expect(demoAdminCredentialError('admin', 'password1')).toContain('email');
    expect(demoAdminCredentialError('admin@leadcars.local', 'corta')).toContain(
      '8',
    );
    expect(
      demoAdminCredentialError('admin@leadcars.local', 'password1'),
    ).toBeNull();
  });
});
