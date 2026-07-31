import { Chat } from './entities/chat.aggregate';
import { ChatId } from './value-objects/chat-id';
import { VisitorId } from './value-objects/visitor-id';
import { CommercialId } from './value-objects/commercial-id';
import { ChatStatus } from './value-objects/chat-status';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Criteria } from 'src/context/shared/domain/criteria';

/**
 * Filtros específicos para consultas de chat
 */
export interface ChatFilters {
  status?: string[];
  priority?: string[];
  visitorId?: string;
  assignedCommercialId?: string;
  availableCommercialIds?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  department?: string;
  hasUnreadMessages?: boolean;
}

/**
 * Opciones de ordenamiento para chats
 */
export interface ChatSortOptions {
  field: 'createdAt' | 'lastMessageDate' | 'priority' | 'totalMessages';
  direction: 'ASC' | 'DESC';
}

/**
 * Resultado de consulta paginada de chats
 */
export interface ChatSearchResult {
  chats: Chat[];
  total: number;
  hasMore: boolean;
}

/**
 * Métricas comerciales agregadas
 */
export interface CommercialMetrics {
  totalChats: number;
  activeChats: number;
  closedChats: number;
  averageResponseTime: number;
  totalMessages: number;
  averageChatDuration: number;
  resolutionRate: number;
}

/**
 * Interfaz del repositorio de Chat V2
 * Define todas las operaciones de persistencia para la entidad Chat
 */
export interface IChatRepository {
  /**
   * Guarda un chat en el repositorio
   */
  save(chat: Chat): Promise<Result<void, DomainError>>;

  /**
   * Busca un chat por su ID
   */
  findById(chatId: ChatId): Promise<Result<Chat, DomainError>>;

  /**
   * Busca todos los chats (use con precaución)
   */
  findAll(): Promise<Result<Chat[], DomainError>>;

  /**
   * Elimina un chat por su ID
   */
  delete(chatId: ChatId): Promise<Result<void, DomainError>>;

  /**
   * Actualiza un chat existente
   */
  update(chat: Chat): Promise<Result<void, DomainError>>;

  /**
   * Busca un chat que cumple con criterios específicos
   */
  findOne(criteria: Criteria<Chat>): Promise<Result<Chat, DomainError>>;

  /**
   * Busca múltiples chats que cumplen con criterios específicos
   */
  match(criteria: Criteria<Chat>): Promise<Result<Chat[], DomainError>>;

  // Métodos específicos para el dominio comercial-visitante

  /**
   * Obtiene chats asignados a un comercial específico
   */
  findByCommercialId(
    commercialId: CommercialId,
    filters?: ChatFilters,
    sort?: ChatSortOptions,
    limit?: number,
    offset?: number,
  ): Promise<Result<ChatSearchResult, DomainError>>;

  /**
   * Obtiene chats de un visitante específico
   */
  findByVisitorId(
    visitorId: VisitorId,
    statuses?: ChatStatus[],
  ): Promise<Result<Chat[], DomainError>>;

  /**
   * Obtiene la cola de chats pendientes ordenados por prioridad y tiempo
   */
  getPendingQueue(
    department?: string,
    limit?: number,
  ): Promise<Result<Chat[], DomainError>>;

  /**
   * Obtiene chats disponibles para asignación (no asignados y en cola)
   */
  getAvailableChats(
    commercialIds: CommercialId[],
    filters?: ChatFilters,
    limit?: number,
  ): Promise<Result<Chat[], DomainError>>;

  /**
   * Busca chats por rango de fechas
   */
  findByDateRange(
    dateFrom: Date,
    dateTo: Date,
    filters?: ChatFilters,
  ): Promise<Result<Chat[], DomainError>>;

  /**
   * Cuenta chats por estado
   */
  countByStatus(
    status: ChatStatus,
    filters?: ChatFilters,
  ): Promise<Result<number, DomainError>>;

  /**
   * Obtiene métricas agregadas para un comercial
   */
  getCommercialMetrics(
    commercialId: CommercialId,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<Result<CommercialMetrics, DomainError>>;

  /**
   * Busca chats con mensajes no leídos
   */
  findWithUnreadMessages(
    commercialId?: CommercialId,
  ): Promise<Result<Chat[], DomainError>>;

  /**
   * Obtiene chats por departamento
   */
  findByDepartment(
    department: string,
    statuses?: ChatStatus[],
    limit?: number,
  ): Promise<Result<Chat[], DomainError>>;

  /**
   * Busca chats que han excedido el tiempo de respuesta esperado
   */
  findOverdueChats(
    maxResponseTimeMinutes: number,
  ): Promise<Result<Chat[], DomainError>>;

  /**
   * Obtiene estadísticas de tiempo de respuesta por período
   */
  getResponseTimeStats(
    dateFrom: Date,
    dateTo: Date,
    groupBy: 'hour' | 'day' | 'week',
  ): Promise<
    Result<
      Array<{ period: string; avgResponseTime: number; count: number }>,
      DomainError
    >
  >;

  /**
   * Cuenta cuántos chats PENDING fueron creados antes de una fecha dada (para posición en sala de espera)
   */
  countPendingCreatedBefore(
    date: Date,
    department?: string,
  ): Promise<Result<number, DomainError>>;

  /**
   * Elimina todos los chats asociados a un visitante específico
   * Devuelve la cantidad de chats eliminados
   */
  deleteByVisitorId(visitorId: VisitorId): Promise<Result<number, DomainError>>;

  /**
   * Busca si existe una conversación activa para un visitante en una empresa.
   * Estados activos: PENDING, ASSIGNED, ACTIVE, TRANSFERRED.
   * Devuelve ok(chat) si existe, ok(null) si no existe.
   */
  findActiveByVisitorAndCompany(
    visitorId: string,
    companyId: string,
  ): Promise<Result<Chat | null, DomainError>>;

  /**
   * Cuenta chats agrupados por visitante para un conjunto de IDs de visitantes
   * Retorna un mapa de visitorId -> cantidad de chats
   */
  countByVisitorIds(
    visitorIds: string[],
  ): Promise<Result<Map<string, number>, DomainError>>;

  /**
   * Para cada visitorId, devuelve el assignedCommercialId del chat abierto
   * más reciente (ASSIGNED/ACTIVE/TRANSFERRED) que tenga comercial asignado.
   */
  findLatestAssignedCommercialByVisitorIds(
    visitorIds: string[],
  ): Promise<Result<Map<string, string>, DomainError>>;

  /**
   * Incrementa el contador de mensajes no leídos de un chat en 1.
   * Operación atómica — no requiere cargar el aggregate completo.
   */
  incrementUnreadCount(chatId: ChatId): Promise<Result<number, DomainError>>;

  /**
   * Resetea a 0 el contador de mensajes no leídos de un chat.
   * Llamar cuando el comercial abre/lee el chat.
   * Devuelve el valor anterior al reset.
   */
  resetUnreadCount(chatId: ChatId): Promise<Result<void, DomainError>>;

  /**
   * Obtiene el contador actual de mensajes no leídos de un chat.
   */
  getUnreadCount(chatId: ChatId): Promise<Result<number, DomainError>>;
}

/**
 * Símbolo de inyección de dependencias para el repositorio de Chat V2
 */
export const CHAT_V2_REPOSITORY = Symbol('CHAT_V2_REPOSITORY');
