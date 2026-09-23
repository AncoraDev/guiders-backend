import {
  CompanyWidgetConfig,
  DEFAULT_WIDGET_CONFIG,
} from '../company-widget-config';

describe('CompanyWidgetConfig', () => {
  it('devuelve defaults si el input está vacío', () => {
    const config = CompanyWidgetConfig.fromInput({});
    expect(config.getValue()).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it('acepta valores válidos', () => {
    const config = CompanyWidgetConfig.fromInput({
      chatEnabled: false,
      autoOpenChatOnMessage: false,
      colorScheme: 'dark',
      theme: 'carbon',
      position: {
        desktop: 'bottom-left',
        mobileEnabled: true,
        mobile: 'top-left',
      },
    });
    expect(config.getValue()).toEqual({
      chatEnabled: false,
      autoOpenChatOnMessage: false,
      colorScheme: 'dark',
      theme: 'carbon',
      position: {
        desktop: 'bottom-left',
        mobileEnabled: true,
        mobile: 'top-left',
      },
    });
  });

  it('rechaza un tema inválido', () => {
    expect(() =>
      CompanyWidgetConfig.fromInput({ theme: 'neon' }),
    ).toThrow('El tema del widget no es válido');
  });

  it('rehidrata datos inválidos sin lanzar', () => {
    const config = CompanyWidgetConfig.fromPersistence({
      colorScheme: 'rainbow',
    });
    expect(config.getValue()).toEqual(DEFAULT_WIDGET_CONFIG);
  });
});
