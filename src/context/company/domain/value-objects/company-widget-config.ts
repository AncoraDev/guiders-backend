export type WidgetColorScheme = 'system' | 'light' | 'dark';
export type WidgetTheme = 'default' | 'carbon';
export type WidgetPositionPreset =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left';

export interface WidgetPositionPrimitives {
  desktop: WidgetPositionPreset;
  mobileEnabled: boolean;
  mobile: WidgetPositionPreset;
}

export interface WidgetConfigPrimitives {
  chatEnabled: boolean;
  autoOpenChatOnMessage: boolean;
  colorScheme: WidgetColorScheme;
  theme: WidgetTheme;
  position: WidgetPositionPrimitives;
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfigPrimitives = {
  chatEnabled: true,
  autoOpenChatOnMessage: true,
  colorScheme: 'system',
  theme: 'default',
  position: {
    desktop: 'bottom-right',
    mobileEnabled: false,
    mobile: 'bottom-right',
  },
};

const COLOR_SCHEMES: readonly WidgetColorScheme[] = [
  'system',
  'light',
  'dark',
];
const THEMES: readonly WidgetTheme[] = ['default', 'carbon'];
const PRESETS: readonly WidgetPositionPreset[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asPreset(value: unknown, fallback: WidgetPositionPreset): WidgetPositionPreset {
  return typeof value === 'string' &&
    (PRESETS as readonly string[]).includes(value)
    ? (value as WidgetPositionPreset)
    : fallback;
}

export class CompanyWidgetConfig {
  constructor(public readonly value: WidgetConfigPrimitives) {}

  public static empty(): CompanyWidgetConfig {
    return new CompanyWidgetConfig({
      ...DEFAULT_WIDGET_CONFIG,
      position: { ...DEFAULT_WIDGET_CONFIG.position },
    });
  }

  public static fromInput(raw: unknown): CompanyWidgetConfig {
    const source =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const positionRaw =
      source.position && typeof source.position === 'object'
        ? (source.position as Record<string, unknown>)
        : {};

    const colorScheme = source.colorScheme;
    if (
      colorScheme !== undefined &&
      (typeof colorScheme !== 'string' ||
        !(COLOR_SCHEMES as readonly string[]).includes(colorScheme))
    ) {
      throw new Error('El modo de color del widget no es válido');
    }

    const theme = source.theme;
    if (
      theme !== undefined &&
      (typeof theme !== 'string' ||
        !(THEMES as readonly string[]).includes(theme))
    ) {
      throw new Error('El tema del widget no es válido');
    }

    if (
      positionRaw.desktop !== undefined &&
      (typeof positionRaw.desktop !== 'string' ||
        !(PRESETS as readonly string[]).includes(positionRaw.desktop))
    ) {
      throw new Error('La posición de escritorio no es válida');
    }

    if (
      positionRaw.mobile !== undefined &&
      (typeof positionRaw.mobile !== 'string' ||
        !(PRESETS as readonly string[]).includes(positionRaw.mobile))
    ) {
      throw new Error('La posición móvil no es válida');
    }

    return new CompanyWidgetConfig({
      chatEnabled: asBoolean(
        source.chatEnabled,
        DEFAULT_WIDGET_CONFIG.chatEnabled,
      ),
      autoOpenChatOnMessage: asBoolean(
        source.autoOpenChatOnMessage,
        DEFAULT_WIDGET_CONFIG.autoOpenChatOnMessage,
      ),
      colorScheme:
        typeof colorScheme === 'string' &&
        (COLOR_SCHEMES as readonly string[]).includes(colorScheme)
          ? (colorScheme as WidgetColorScheme)
          : DEFAULT_WIDGET_CONFIG.colorScheme,
      theme:
        typeof theme === 'string' &&
        (THEMES as readonly string[]).includes(theme)
          ? (theme as WidgetTheme)
          : DEFAULT_WIDGET_CONFIG.theme,
      position: {
        desktop: asPreset(
          positionRaw.desktop,
          DEFAULT_WIDGET_CONFIG.position.desktop,
        ),
        mobileEnabled: asBoolean(
          positionRaw.mobileEnabled,
          DEFAULT_WIDGET_CONFIG.position.mobileEnabled,
        ),
        mobile: asPreset(
          positionRaw.mobile,
          DEFAULT_WIDGET_CONFIG.position.mobile,
        ),
      },
    });
  }

  public static fromPersistence(raw: unknown): CompanyWidgetConfig {
    try {
      return CompanyWidgetConfig.fromInput(raw);
    } catch {
      return CompanyWidgetConfig.empty();
    }
  }

  public getValue(): WidgetConfigPrimitives {
    return this.value;
  }
}
