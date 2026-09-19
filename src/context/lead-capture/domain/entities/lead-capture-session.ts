import { Result, err, ok } from 'src/context/shared/domain/result';
import { InvalidLeadCaptureSessionError } from '../errors/lead-capture.error';
import { MAX_LEAD_CAPTURE_STEPS } from './lead-capture-flow';

/**
 * Situación de la captación:
 * - in_progress: el visitante entró en el guion y no lo terminó
 * - completed: el guion se envió y el lead ya está guardado
 */
export type LeadCaptureSessionStatus = 'in_progress' | 'completed';

/** Punto del asistente donde se quedó el visitante. */
export type LeadCaptureSessionPhase = 'intro' | 'steps' | 'final' | 'done';

const PHASES: LeadCaptureSessionPhase[] = ['intro', 'steps', 'final', 'done'];

/** Tope de caracteres por respuesta; el guion pide datos, no redacciones. */
const MAX_ANSWER_LENGTH = 500;

export interface LeadCaptureSessionAnswerPrimitives {
  stepId: string;
  prompt: string;
  answer: string;
  field?: string;
}

export interface LeadCaptureSessionPrimitives {
  id: string;
  visitorId: string;
  /** Empresa del sitio, cuando el token del visitante la trae. */
  companyId?: string;
  /** Chat donde se está recorriendo el guion; cambia si se abre uno nuevo. */
  chatId: string | null;
  flowId?: string;
  status: LeadCaptureSessionStatus;
  phase: LeadCaptureSessionPhase;
  stepId: string | null;
  answers: LeadCaptureSessionAnswerPrimitives[];
  /** Pasos ya recorridos, en orden: el visitante puede volver atrás. */
  trail: string[];
  startedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/** Datos que el asistente manda en cada avance. */
export interface LeadCaptureSessionProgress {
  chatId: string | null;
  flowId?: string;
  phase: LeadCaptureSessionPhase;
  stepId: string | null;
  answers: LeadCaptureSessionAnswerPrimitives[];
  trail: string[];
}

/**
 * Captación a medias de un visitante. Vive por visitante y no por chat: si el
 * visitante vuelve días después y el SDK le abre un chat nuevo, su progreso
 * sigue siendo el mismo y puede retomarlo donde lo dejó.
 */
export class LeadCaptureSession {
  private constructor(private readonly props: LeadCaptureSessionPrimitives) {}

  static create(
    props: LeadCaptureSessionPrimitives,
  ): Result<LeadCaptureSession, InvalidLeadCaptureSessionError> {
    const error = LeadCaptureSession.findError(props);
    if (error) return err(error);
    return ok(new LeadCaptureSession(LeadCaptureSession.normalize(props)));
  }

  /** Rehidratación desde persistencia: no revalida. */
  static fromPrimitives(
    props: LeadCaptureSessionPrimitives,
  ): LeadCaptureSession {
    return new LeadCaptureSession(LeadCaptureSession.normalize(props));
  }

  toPrimitives(): LeadCaptureSessionPrimitives {
    return {
      ...this.props,
      answers: this.props.answers.map((answer) => ({ ...answer })),
      trail: [...this.props.trail],
    };
  }

  get visitorId(): string {
    return this.props.visitorId;
  }

  get status(): LeadCaptureSessionStatus {
    return this.props.status;
  }

  get isCompleted(): boolean {
    return this.props.status === 'completed';
  }

  /**
   * Guarda un avance del guion. Una captación ya enviada no se reabre: el lead
   * está guardado y volver atrás dejaría al visitante repitiendo el guion.
   */
  applyProgress(
    progress: LeadCaptureSessionProgress,
  ): Result<LeadCaptureSession, InvalidLeadCaptureSessionError> {
    if (this.isCompleted) return ok(this);

    return LeadCaptureSession.create({
      ...this.props,
      chatId: progress.chatId,
      flowId: progress.flowId ?? this.props.flowId,
      phase: progress.phase,
      stepId: progress.stepId,
      answers: progress.answers,
      trail: progress.trail,
      status: progress.phase === 'done' ? 'completed' : 'in_progress',
      updatedAt: new Date(),
      completedAt: progress.phase === 'done' ? new Date() : null,
    });
  }

  /** El guion se envió: el asistente no se le vuelve a ofrecer. */
  complete(chatId?: string): LeadCaptureSession {
    if (this.isCompleted) return this;
    const now = new Date();
    return new LeadCaptureSession({
      ...this.props,
      chatId: chatId ?? this.props.chatId,
      status: 'completed',
      phase: 'done',
      updatedAt: now,
      completedAt: now,
    });
  }

  /**
   * Primer avance de un visitante que no tenía nada guardado.
   */
  static start(
    input: {
      id: string;
      visitorId: string;
      companyId?: string;
    } & LeadCaptureSessionProgress,
  ): Result<LeadCaptureSession, InvalidLeadCaptureSessionError> {
    const now = new Date();
    return LeadCaptureSession.create({
      id: input.id,
      visitorId: input.visitorId,
      companyId: input.companyId,
      chatId: input.chatId,
      flowId: input.flowId,
      status: input.phase === 'done' ? 'completed' : 'in_progress',
      phase: input.phase,
      stepId: input.stepId,
      answers: input.answers,
      trail: input.trail,
      startedAt: now,
      updatedAt: now,
      completedAt: input.phase === 'done' ? now : null,
    });
  }

  /**
   * El progreso llega de un cliente público, así que se acota: sin esto una
   * sesión podría crecer sin límite a base de peticiones.
   */
  private static findError(
    props: LeadCaptureSessionPrimitives,
  ): InvalidLeadCaptureSessionError | null {
    if (!props.visitorId?.trim()) {
      return new InvalidLeadCaptureSessionError(
        'La captación necesita un visitante',
      );
    }
    if (!PHASES.includes(props.phase)) {
      return new InvalidLeadCaptureSessionError(
        `Fase de captación desconocida: ${props.phase}`,
      );
    }
    if (props.answers.length > MAX_LEAD_CAPTURE_STEPS) {
      return new InvalidLeadCaptureSessionError(
        `La captación no puede tener más de ${MAX_LEAD_CAPTURE_STEPS} respuestas`,
      );
    }
    if (props.trail.length > MAX_LEAD_CAPTURE_STEPS) {
      return new InvalidLeadCaptureSessionError(
        `La captación no puede recorrer más de ${MAX_LEAD_CAPTURE_STEPS} pasos`,
      );
    }
    for (const answer of props.answers) {
      if (!answer.stepId?.trim()) {
        return new InvalidLeadCaptureSessionError(
          'Cada respuesta tiene que indicar su paso',
        );
      }
      if (
        answer.answer.length > MAX_ANSWER_LENGTH ||
        answer.prompt.length > MAX_ANSWER_LENGTH
      ) {
        return new InvalidLeadCaptureSessionError(
          `Las respuestas no pueden pasar de ${MAX_ANSWER_LENGTH} caracteres`,
        );
      }
    }
    return null;
  }

  private static normalize(
    props: LeadCaptureSessionPrimitives,
  ): LeadCaptureSessionPrimitives {
    return {
      ...props,
      answers: (props.answers ?? []).map((answer) => ({
        stepId: answer.stepId,
        prompt: answer.prompt,
        answer: answer.answer,
        field: answer.field,
      })),
      trail: props.trail ?? [],
    };
  }
}
