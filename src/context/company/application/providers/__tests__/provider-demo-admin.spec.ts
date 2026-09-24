import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  demoAdminCredentialError,
  openDemoAdminSession,
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

  it('abre la sesión del proveedor que coincide', () => {
    const companyId = Uuid.random().value;
    expect(
      openDemoAdminSession(
        {
          demoAdminEmail: 'admin@autopractik.es',
          demoAdminPassword: 'password1',
          accessToken: 'gdr_live_example',
          companyId,
        },
        'Autopractik',
        'admin@autopractik.es',
        'password1',
      ),
    ).toEqual({
      token: 'gdr_live_example',
      companyId,
      name: 'Autopractik',
    });
  });

  it('no abre la sesión de otro proveedor', () => {
    expect(
      openDemoAdminSession(
        {
          demoAdminEmail: 'admin@leadcars.local',
          demoAdminPassword: 'password1',
          accessToken: 'gdr_live_example',
          companyId: Uuid.random().value,
        },
        'LeadCars',
        'admin@autopractik.es',
        'password1',
      ),
    ).toBeNull();
  });
});
