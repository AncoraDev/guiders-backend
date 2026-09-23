import { Result, err, ok } from 'src/context/shared/domain/result';
import { InvalidLeadCaptureFlowError } from '../errors/lead-capture.error';

/**
 * Tipos de paso del guion:
 * - message: solo informa y continúa
 * - choice: el visitante elige una opción y cada opción decide el siguiente paso
 * - text: el visitante escribe y la respuesta se guarda en un campo del lead
 */
export type LeadCaptureStepType = 'message' | 'choice' | 'text';

export type LeadCaptureValidation = 'email' | 'phone' | 'none';

/** Campos del lead a los que puede apuntar un paso de texto. */
export const LEAD_CONTACT_FIELDS = [
  'nombre',
  'apellidos',
  'email',
  'telefono',
  'poblacion',
] as const;

export type LeadContactField = (typeof LEAD_CONTACT_FIELDS)[number];

/** Máximo de pasos: un guion más largo hace que el visitante abandone. */
export const MAX_LEAD_CAPTURE_STEPS = 20;

/** Máximo de opciones por paso para que quepan en el widget. */
export const MAX_LEAD_CAPTURE_OPTIONS = 5;

/** Cierre del guion sin el formulario de contacto. */
export const LEAD_CAPTURE_END = '__end__';

export function isLeadCaptureStepRef(
  next: string | null | undefined,
): next is string {
  return typeof next === 'string' && next.length > 0 && next !== LEAD_CAPTURE_END;
}

export interface LeadCaptureOptionPrimitives {
  id: string;
  label: string;
  /**
   * Paso al que lleva la opción.
   * `null` pide datos de contacto; `__end__` cierra el guion sin formulario.
   */
  next?: string | null;
}

export interface LeadCaptureStepPrimitives {
  id: string;
  type: LeadCaptureStepType;
  prompt: string;
  /** Solo en choice: cada opción decide el siguiente paso (de ahí el árbol). */
  options?: LeadCaptureOptionPrimitives[];
  /**
   * Solo en text: campo del lead donde acaba la respuesta. Si no es uno de
   * LEAD_CONTACT_FIELDS se guarda en additionalData con esa clave.
   */
  field?: string;
  validation?: LeadCaptureValidation;
  required?: boolean;
  /** Siguiente paso; `null` pide contacto y `__end__` cierra sin formulario. */
  next?: string | null;
}

export interface LeadCaptureIntroPrimitives {
  title: string;
  body: string;
  ctaLabel: string;
}

export interface LeadCaptureFlowPrimitives {
  id: string;
  companyId: string;
  name: string;
  enabled: boolean;
  intro: LeadCaptureIntroPrimitives;
  startStepId: string;
  steps: LeadCaptureStepPrimitives[];
  updatedAt: Date;
  updatedBy: string;
}

/**
 * Guion de captación que recorre el visitante cuando no hay comerciales
 * conectados. El formulario de contacto no forma parte del árbol: el widget lo
 * añade solo si una rama termina en `null`. `__end__` cierra sin pedirlo.
 */
export class LeadCaptureFlow {
  private constructor(private readonly props: LeadCaptureFlowPrimitives) {}

  static create(
    props: LeadCaptureFlowPrimitives,
  ): Result<LeadCaptureFlow, InvalidLeadCaptureFlowError> {
    const error = LeadCaptureFlow.findError(props);
    if (error) return err(error);
    return ok(new LeadCaptureFlow(LeadCaptureFlow.normalize(props)));
  }

  /** Rehidratación desde persistencia: no revalida. */
  static fromPrimitives(props: LeadCaptureFlowPrimitives): LeadCaptureFlow {
    return new LeadCaptureFlow(LeadCaptureFlow.normalize(props));
  }

  toPrimitives(): LeadCaptureFlowPrimitives {
    return {
      ...this.props,
      intro: { ...this.props.intro },
      steps: this.props.steps.map((step) => ({
        ...step,
        options: step.options?.map((option) => ({ ...option })),
      })),
    };
  }

  get companyId(): string {
    return this.props.companyId;
  }

  get enabled(): boolean {
    return this.props.enabled;
  }

  /**
   * Devuelve el primer motivo por el que el guion no es recorrible por el
   * visitante, o null si es válido.
   */
  private static findError(
    props: LeadCaptureFlowPrimitives,
  ): InvalidLeadCaptureFlowError | null {
    if (!props.companyId?.trim()) {
      return invalid('El guion necesita una empresa');
    }
    if (!props.name?.trim()) {
      return invalid('El guion necesita un nombre');
    }
    if (!props.intro?.title?.trim() || !props.intro?.body?.trim()) {
      return invalid('La tarjeta de inicio necesita título y texto');
    }
    if (!props.intro.ctaLabel?.trim()) {
      return invalid('La tarjeta de inicio necesita el texto del botón');
    }
    if (!props.steps?.length) {
      return invalid('El guion necesita al menos un paso');
    }
    if (props.steps.length > MAX_LEAD_CAPTURE_STEPS) {
      return invalid(
        `El guion no puede tener más de ${MAX_LEAD_CAPTURE_STEPS} pasos`,
      );
    }

    const ids = new Set<string>();
    for (const step of props.steps) {
      if (!step.id?.trim()) {
        return invalid('Hay un paso sin identificador');
      }
      if (ids.has(step.id)) {
        return invalid(`El paso ${step.id} está repetido`);
      }
      ids.add(step.id);

      if (!step.prompt?.trim()) {
        return invalid(`El paso ${step.id} no tiene texto`);
      }

      const shapeError = LeadCaptureFlow.findStepShapeError(step);
      if (shapeError) return shapeError;
    }

    if (!ids.has(props.startStepId)) {
      return invalid('El paso inicial no existe en el guion');
    }

    for (const step of props.steps) {
      for (const target of LeadCaptureFlow.targetsOf(step)) {
        if (isLeadCaptureStepRef(target) && !ids.has(target)) {
          return invalid(
            `El paso ${step.id} apunta a un paso que no existe: ${target}`,
          );
        }
      }
    }

    return LeadCaptureFlow.findCycleError(props);
  }

  private static findStepShapeError(
    step: LeadCaptureStepPrimitives,
  ): InvalidLeadCaptureFlowError | null {
    if (step.type === 'choice') {
      if (!step.options?.length) {
        return invalid(`El paso ${step.id} necesita al menos una opción`);
      }
      if (step.options.length > MAX_LEAD_CAPTURE_OPTIONS) {
        return invalid(
          `El paso ${step.id} no puede tener más de ${MAX_LEAD_CAPTURE_OPTIONS} opciones`,
        );
      }
      const optionIds = new Set<string>();
      for (const option of step.options) {
        if (!option.id?.trim() || !option.label?.trim()) {
          return invalid(
            `El paso ${step.id} tiene una opción sin identificador o sin texto`,
          );
        }
        if (optionIds.has(option.id)) {
          return invalid(
            `El paso ${step.id} tiene la opción ${option.id} repetida`,
          );
        }
        optionIds.add(option.id);
      }
      return null;
    }

    if (step.type === 'text' && !step.field?.trim()) {
      return invalid(
        `El paso ${step.id} necesita el campo donde guardar la respuesta`,
      );
    }

    return null;
  }

  /**
   * Un bucle dejaría al visitante dando vueltas sin llegar a dejar sus datos.
   */
  private static findCycleError(
    props: LeadCaptureFlowPrimitives,
  ): InvalidLeadCaptureFlowError | null {
    const byId = new Map(props.steps.map((step) => [step.id, step]));
    const visiting = new Set<string>();
    const done = new Set<string>();

    const walk = (stepId: string): string | null => {
      if (visiting.has(stepId)) return stepId;
      if (done.has(stepId)) return null;

      visiting.add(stepId);
      const step = byId.get(stepId);
      for (const target of step ? LeadCaptureFlow.targetsOf(step) : []) {
        if (!isLeadCaptureStepRef(target)) continue;
        const cycleAt = walk(target);
        if (cycleAt) return cycleAt;
      }
      visiting.delete(stepId);
      done.add(stepId);
      return null;
    };

    const cycleAt = walk(props.startStepId);
    return cycleAt
      ? invalid(`El guion tiene un bucle que vuelve al paso ${cycleAt}`)
      : null;
  }

  /** Pasos a los que puede saltar un paso, contando las opciones. */
  private static targetsOf(step: LeadCaptureStepPrimitives): (string | null)[] {
    if (step.type === 'choice') {
      return (step.options ?? []).map((option) => option.next ?? null);
    }
    return [step.next ?? null];
  }

  /** Deja fuera lo que no aplica a cada tipo de paso. */
  private static normalize(
    props: LeadCaptureFlowPrimitives,
  ): LeadCaptureFlowPrimitives {
    return {
      ...props,
      name: props.name.trim(),
      intro: {
        title: props.intro.title.trim(),
        body: props.intro.body.trim(),
        ctaLabel: props.intro.ctaLabel.trim(),
      },
      steps: props.steps.map((step) => ({
        id: step.id,
        type: step.type,
        prompt: step.prompt.trim(),
        ...(step.type === 'choice'
          ? {
              options: (step.options ?? []).map((option) => ({
                id: option.id,
                label: option.label.trim(),
                next: option.next ?? null,
              })),
            }
          : { next: step.next ?? null }),
        ...(step.type === 'text'
          ? {
              field: step.field?.trim(),
              validation: step.validation ?? 'none',
              required: step.required ?? true,
            }
          : {}),
      })),
    };
  }
}

function invalid(message: string): InvalidLeadCaptureFlowError {
  return new InvalidLeadCaptureFlowError(message);
}
