/**
 * Value Object para la configuración de White Label por empresa
 */

/**
 * Primitivos para colores
 */
export interface WhiteLabelColorsPrimitives {
  primary: string;
  secondary: string;
  tertiary: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;
}

/**
 * Primitivos para branding
 */
export interface WhiteLabelBrandingPrimitives {
  logoUrl: string | null;
  faviconUrl: string | null;
  brandName: string;
}

/**
 * Primitivos para archivo de fuente
 */
export interface WhiteLabelFontFilePrimitives {
  name: string;
  url: string;
}

/**
 * Primitivos para tipografía
 */
export interface WhiteLabelTypographyPrimitives {
  fontFamily: string;
  customFontName?: string | null;
  customFontFiles: WhiteLabelFontFilePrimitives[];
}

/**
 * Temas disponibles
 */
export const ALLOWED_THEMES = ['light', 'dark', 'system'] as const;
export type AllowedTheme = (typeof ALLOWED_THEMES)[number];

/**
 * Primitivos de la configuración White Label
 *
 * Los campos embed son opcionales en la firma pública (para tolerar
 * documentos legacy en `fromPrimitives`), pero la VO los normaliza a
 * `boolean` y `string[]` con defaults en el constructor. `toPrimitives()`
 * siempre los emite poblados.
 */
export interface WhiteLabelConfigPrimitives {
  id: string;
  companyId: string;
  colors: WhiteLabelColorsPrimitives;
  branding: WhiteLabelBrandingPrimitives;
  typography: WhiteLabelTypographyPrimitives;
  theme: AllowedTheme;
  embedEnabled?: boolean;
  embedAllowedOrigins?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Primitivos de salida (post-normalización por la VO)
 */
export interface WhiteLabelConfigPrimitivesOutput {
  id: string;
  companyId: string;
  colors: WhiteLabelColorsPrimitives;
  branding: WhiteLabelBrandingPrimitives;
  typography: WhiteLabelTypographyPrimitives;
  theme: AllowedTheme;
  embedEnabled: boolean;
  embedAllowedOrigins: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Valores por defecto de colores
 */
const DEFAULT_COLORS: WhiteLabelColorsPrimitives = {
  primary: '#007bff',
  secondary: '#6c757d',
  tertiary: '#17a2b8',
  background: '#ffffff',
  surface: '#f8f9fa',
  text: '#212529',
  textMuted: '#6c757d',
};

/**
 * Valores por defecto de tipografía
 */
const DEFAULT_TYPOGRAPHY: WhiteLabelTypographyPrimitives = {
  fontFamily: 'Inter',
  customFontName: null,
  customFontFiles: [],
};

/**
 * Fuentes predefinidas permitidas
 */
export const ALLOWED_FONT_FAMILIES = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Poppins',
  'Montserrat',
  'custom',
] as const;

export type AllowedFontFamily = (typeof ALLOWED_FONT_FAMILIES)[number];

/**
 * Tema por defecto
 */
const DEFAULT_THEME: AllowedTheme = 'light';

/**
 * Value Object para configuración White Label por empresa
 */
export class WhiteLabelConfig {
  private constructor(
    private readonly _id: string,
    private readonly _companyId: string,
    private readonly _colors: WhiteLabelColorsPrimitives,
    private readonly _branding: WhiteLabelBrandingPrimitives,
    private readonly _typography: WhiteLabelTypographyPrimitives,
    private readonly _theme: AllowedTheme,
    private readonly _embedEnabled: boolean,
    private readonly _embedAllowedOrigins: string[],
    private readonly _createdAt: Date,
    private readonly _updatedAt: Date,
  ) {}

  /**
   * Crea una nueva configuración con valores por defecto
   */
  static createDefault(
    id: string,
    companyId: string,
    brandName: string,
  ): WhiteLabelConfig {
    const now = new Date();
    return new WhiteLabelConfig(
      id,
      companyId,
      { ...DEFAULT_COLORS },
      {
        logoUrl: null,
        faviconUrl: null,
        brandName,
      },
      { ...DEFAULT_TYPOGRAPHY },
      DEFAULT_THEME,
      false,
      [],
      now,
      now,
    );
  }

  /**
   * Crea una configuración desde primitivos
   */
  static create(props: WhiteLabelConfigPrimitives): WhiteLabelConfig {
    return new WhiteLabelConfig(
      props.id,
      props.companyId,
      props.colors,
      props.branding,
      props.typography,
      props.theme || DEFAULT_THEME,
      props.embedEnabled ?? false,
      props.embedAllowedOrigins ? [...props.embedAllowedOrigins] : [],
      props.createdAt || new Date(),
      props.updatedAt || new Date(),
    );
  }

  /**
   * Reconstruye desde primitivos
   */
  static fromPrimitives(data: WhiteLabelConfigPrimitives): WhiteLabelConfig {
    return WhiteLabelConfig.create(data);
  }

  /**
   * Serializa a primitivos
   */
  toPrimitives(): WhiteLabelConfigPrimitivesOutput {
    return {
      id: this._id,
      companyId: this._companyId,
      colors: { ...this._colors },
      branding: { ...this._branding },
      typography: {
        ...this._typography,
        customFontFiles: [...this._typography.customFontFiles],
      },
      theme: this._theme,
      embedEnabled: this._embedEnabled,
      embedAllowedOrigins: [...this._embedAllowedOrigins],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }

  // Getters
  get id(): string {
    return this._id;
  }

  get companyId(): string {
    return this._companyId;
  }

  get colors(): WhiteLabelColorsPrimitives {
    return { ...this._colors };
  }

  get branding(): WhiteLabelBrandingPrimitives {
    return { ...this._branding };
  }

  get typography(): WhiteLabelTypographyPrimitives {
    return {
      ...this._typography,
      customFontFiles: [...this._typography.customFontFiles],
    };
  }

  get theme(): AllowedTheme {
    return this._theme;
  }

  get embedEnabled(): boolean {
    return this._embedEnabled;
  }

  get embedAllowedOrigins(): string[] {
    return [...this._embedAllowedOrigins];
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Crea una copia con propiedades actualizadas
   */
  update(updates: {
    colors?: Partial<WhiteLabelColorsPrimitives>;
    branding?: Partial<WhiteLabelBrandingPrimitives>;
    typography?: Partial<WhiteLabelTypographyPrimitives>;
    theme?: AllowedTheme;
    embed?: { embedEnabled?: boolean; embedAllowedOrigins?: string[] };
  }): WhiteLabelConfig {
    return new WhiteLabelConfig(
      this._id,
      this._companyId,
      updates.colors ? { ...this._colors, ...updates.colors } : this._colors,
      updates.branding
        ? { ...this._branding, ...updates.branding }
        : this._branding,
      updates.typography
        ? {
            ...this._typography,
            ...updates.typography,
            customFontFiles:
              updates.typography.customFontFiles ??
              this._typography.customFontFiles,
          }
        : this._typography,
      updates.theme ?? this._theme,
      updates.embed?.embedEnabled ?? this._embedEnabled,
      updates.embed?.embedAllowedOrigins
        ? [...updates.embed.embedAllowedOrigins]
        : this._embedAllowedOrigins,
      this._createdAt,
      new Date(),
    );
  }

  /**
   * Actualiza la URL del logo
   */
  updateLogoUrl(logoUrl: string | null): WhiteLabelConfig {
    return this.update({
      branding: { ...this._branding, logoUrl },
    });
  }

  /**
   * Actualiza la URL del favicon
   */
  updateFaviconUrl(faviconUrl: string | null): WhiteLabelConfig {
    return this.update({
      branding: { ...this._branding, faviconUrl },
    });
  }

  /**
   * Añade un archivo de fuente
   */
  addFontFile(fontFile: WhiteLabelFontFilePrimitives): WhiteLabelConfig {
    const existingFiles = this._typography.customFontFiles.filter(
      (f) => f.name !== fontFile.name,
    );
    return this.update({
      typography: {
        ...this._typography,
        fontFamily: 'custom',
        customFontFiles: [...existingFiles, fontFile],
      },
    });
  }

  /**
   * Elimina un archivo de fuente
   */
  removeFontFile(fileName: string): WhiteLabelConfig {
    const updatedFiles = this._typography.customFontFiles.filter(
      (f) => f.name !== fileName,
    );
    return this.update({
      typography: {
        ...this._typography,
        customFontFiles: updatedFiles,
        // Si no quedan fuentes custom, volver a Inter
        fontFamily:
          updatedFiles.length === 0 ? 'Inter' : this._typography.fontFamily,
      },
    });
  }

  /**
   * Elimina todos los archivos de fuente
   */
  removeAllFontFiles(): WhiteLabelConfig {
    return this.update({
      typography: {
        ...this._typography,
        fontFamily: 'Inter',
        customFontName: null,
        customFontFiles: [],
      },
    });
  }

  /**
   * Verifica si tiene fuentes personalizadas
   */
  hasCustomFonts(): boolean {
    return this._typography.customFontFiles.length > 0;
  }

  /**
   * Verifica si tiene logo
   */
  hasLogo(): boolean {
    return this._branding.logoUrl !== null;
  }

  /**
   * Verifica si tiene favicon
   */
  hasFavicon(): boolean {
    return this._branding.faviconUrl !== null;
  }
}
