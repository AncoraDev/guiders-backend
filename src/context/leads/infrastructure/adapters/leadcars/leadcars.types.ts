/**
 * Tipos específicos para la integración con LeadCars API v2.5
 * Documentación oficial: docs/integrations/leadcar/LeadCars_API_V2_5.pdf
 */

/**
 * Configuración específica de LeadCars
 */
export interface LeadcarsConfig {
  clienteToken: string;
  useSandbox: boolean;
  concesionarioId: number;
  sedeId?: number;
  /** Código de campaña (texto, no numérico). Antes: campanaId (number) */
  campanaCode?: string;
  /** ID numérico del tipo de lead obtenido de GET /tipos. Antes: string enum */
  tipoLeadDefault: number;
}

/**
 * Estado de un lead en LeadCars (API v2.5)
 */
export interface LeadcarsEstado {
  id: number;
  motivos?: string[];
  texto?: string;
}

/**
 * Temperatura del lead (API v2.5)
 */
export type LeadcarsTemperature = 'cold' | 'warn' | 'hot';

/**
 * Campo dinámico de un estado de LeadCars (API v2.5)
 */
export interface LeadcarsStateField {
  name: string;
  type: 'checkbox' | 'text' | 'textarea' | (string & {});
  title: string;
  required: boolean;
  options?: string[];
}

/**
 * Item de estado de LeadCars (API v2.5)
 */
export interface LeadcarsStateItem {
  id: number;
  group: string;
  fields: LeadcarsStateField[];
}

/**
 * Response del endpoint GET /listStates (API v2.5)
 * Mapa de nombre de estado → detalle del estado
 */
export interface LeadcarsListStatesResponse {
  [stateName: string]: LeadcarsStateItem;
}

/**
 * Request para crear un lead en LeadCars (API v2.5)
 * Los campos dinámicos ahora van dentro de `custom` (antes iban al nivel raíz).
 */
export interface LeadcarsCreateLeadRequest {
  nombre: string;
  apellidos?: string;
  email?: string;
  telefono?: string;
  /** Teléfono móvil adicional en formato E.164 */
  movil?: string;
  /** Código postal */
  cp?: string;
  /** Provincia (antes: poblacion) */
  provincia?: string;
  /** Comentario/observaciones (antes: observaciones) */
  comentario?: string;
  /** URL de origen del lead */
  url_origen?: string;
  /** ID del concesionario (antes: concesionario_id) */
  concesionario: number;
  /** ID de la sede (antes: sede_id) */
  sede?: number;
  /** ID numérico del tipo de lead de GET /tipos (antes: LeadcarsTipoLead string enum) */
  tipo_lead: number;
  /** Código de campaña en texto (antes: campana_id number) */
  campana?: string;
  /** Campos dinámicos clave:valor (API v2.5: dentro de custom, antes al nivel raíz) */
  custom?: Record<string, unknown>;
  /** Estado del lead (API v2.5) */
  estado?: LeadcarsEstado;
  /** Temperatura del lead (API v2.5) */
  temperature?: LeadcarsTemperature;
}

/**
 * Response de crear lead en LeadCars
 */
export interface LeadcarsCreateLeadResponse {
  success: boolean;
  data?: {
    id: number;
    referencia: string;
    nombre: string;
    email?: string;
    telefono?: string;
    estado: string;
    created_at: string;
    updated_at: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

/**
 * Request para editar un lead en LeadCars (API v2.5)
 * PUT /leads/{idLead}/submit — campo `estado` requerido en v2.5
 */
export interface LeadcarsEditLeadRequest {
  /** Estado del lead (requerido en v2.5) */
  estado: LeadcarsEstado;
  /** Temperatura del lead (API v2.5) */
  temperature?: LeadcarsTemperature;
  nombre?: string;
  apellidos?: string;
  telefono?: string;
  cp?: string;
  provincia?: string;
  comentario?: string;
  url_origen?: string;
  concesionario?: number;
  sede?: number;
  campana?: string;
}

/**
 * Response de editar lead en LeadCars (API v2.5)
 */
export interface LeadcarsEditLeadResponse {
  success: boolean;
  data?: {
    id: number;
    referencia: string;
    nombre: string;
    email?: string;
    telefono?: string;
    estado: string;
    created_at: string;
    updated_at: string;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

/**
 * Request para añadir conversación de chat a un lead
 */
export interface LeadcarsAddChatConversationRequest {
  lead_id: number;
  conversacion: LeadcarsChatMessage[];
  fecha_inicio: string;
  fecha_fin?: string;
  resumen?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Mensaje individual de chat para LeadCars
 */
export interface LeadcarsChatMessage {
  emisor: 'VISITANTE' | 'COMERCIAL' | 'BOT';
  mensaje: string;
  fecha: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response de añadir conversación
 */
export interface LeadcarsAddConversationResponse {
  success: boolean;
  data?: {
    id: number;
    lead_id: number;
    created_at: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Request para añadir comentario a un lead
 */
export interface LeadcarsAddCommentRequest {
  lead_id: number;
  comentario: string;
  tipo?: 'NOTA' | 'SEGUIMIENTO' | 'IMPORTANTE';
  privado?: boolean;
}

/**
 * Response de añadir comentario
 */
export interface LeadcarsAddCommentResponse {
  success: boolean;
  data?: {
    id: number;
    lead_id: number;
    comentario: string;
    created_at: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Response genérica de error de LeadCars
 */
export interface LeadcarsErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

/**
 * Información de concesionario
 */
export interface LeadcarsConcesionario {
  id: number;
  nombre: string;
  codigo?: string;
  activo: boolean;
}

/**
 * Información de sede
 */
export interface LeadcarsSede {
  id: number;
  nombre: string;
  concesionario_id: number;
  direccion?: string;
  activo: boolean;
}

/**
 * Información de campaña
 */
export interface LeadcarsCampana {
  id: number;
  nombre: string;
  codigo?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  activo: boolean;
}

/**
 * Response de listar concesionarios
 * La API puede devolver el array directamente o dentro de { success, data }
 */
export type LeadcarsListConcesionariosResponse =
  | LeadcarsConcesionario[]
  | {
      success: boolean;
      data?: LeadcarsConcesionario[];
      error?: { code: string; message: string };
    };

/**
 * Response de listar sedes
 * La API puede devolver el array directamente o dentro de { success, data }
 */
export type LeadcarsListSedesResponse =
  | LeadcarsSede[]
  | {
      success: boolean;
      data?: LeadcarsSede[];
      error?: { code: string; message: string };
    };

/**
 * Response de listar campañas
 * La API puede devolver el array directamente o dentro de { success, data }
 */
export type LeadcarsListCampanasResponse =
  | LeadcarsCampana[]
  | {
      success: boolean;
      data?: LeadcarsCampana[];
      error?: { code: string; message: string };
    };

/**
 * Tipo de lead de LeadCars (obtenido de GET /tipos)
 * La API devuelve el nombre en el campo NOMBRE (mayúsculas) y un slug en VALOR
 */
export interface LeadcarsTipoLeadItem {
  id: number;
  NOMBRE: string;
  VALOR?: string;
  custom?: boolean;
}

/**
 * Response de listar tipos de lead
 * La API puede devolver el array directamente o dentro de { success, data }
 */
export type LeadcarsListTiposResponse =
  | LeadcarsTipoLeadItem[]
  | {
      success: boolean;
      data?: LeadcarsTipoLeadItem[];
      error?: { code: string; message: string };
    };

/**
 * URLs base de LeadCars API v2.5
 */
export const LEADCARS_API_URLS = {
  production: 'https://api.leadcars.es/api/v2',
  sandbox: 'https://apisandbox.leadcars.es/api/v2',
} as const;

/**
 * Configuración de retry para LeadCars
 */
export const LEADCARS_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
} as const;

/**
 * Headers requeridos para LeadCars API
 */
export const LEADCARS_REQUIRED_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
} as const;
