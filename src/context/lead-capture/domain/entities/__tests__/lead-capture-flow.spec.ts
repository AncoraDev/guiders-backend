import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  LeadCaptureFlow,
  LeadCaptureFlowPrimitives,
  LeadCaptureStepPrimitives,
  MAX_LEAD_CAPTURE_STEPS,
} from '../lead-capture-flow';

describe('LeadCaptureFlow', () => {
  const companyId = Uuid.random().value;

  const buildFlow = (
    steps: LeadCaptureStepPrimitives[],
    startStepId = steps[0]?.id ?? 'inicio',
  ): LeadCaptureFlowPrimitives => ({
    id: Uuid.random().value,
    companyId,
    name: 'Captación sin agentes',
    enabled: true,
    intro: {
      title: 'Ahora no hay nadie',
      body: 'Te hago unas preguntas rápidas',
      ctaLabel: 'Empezar',
    },
    startStepId,
    steps,
    updatedAt: new Date(),
    updatedBy: Uuid.random().value,
  });

  it('acepta un guion con opciones que acaban en el paso final', () => {
    const result = LeadCaptureFlow.create(
      buildFlow([
        {
          id: 'interes',
          type: 'choice',
          prompt: '¿Qué te interesa?',
          options: [
            { id: 'nuevo', label: 'Coche nuevo', next: 'modelo' },
            { id: 'km0', label: 'Km 0', next: null },
          ],
        },
        {
          id: 'modelo',
          type: 'text',
          prompt: '¿Qué modelo buscas?',
          field: 'interes',
          next: null,
        },
      ]),
    );

    expect(result.isOk()).toBe(true);
    const primitives = result.unwrap().toPrimitives();
    expect(primitives.steps[1].validation).toBe('none');
    expect(primitives.steps[1].required).toBe(true);
  });

  it('rechaza un guion cuyo paso inicial no existe', () => {
    const result = LeadCaptureFlow.create(
      buildFlow(
        [{ id: 'saludo', type: 'message', prompt: 'Hola', next: null }],
        'no-existe',
      ),
    );

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain('paso inicial');
  });

  it('acepta un cierre sin pedir datos de contacto', () => {
    const result = LeadCaptureFlow.create(
      buildFlow([
        {
          id: 'interes',
          type: 'choice',
          prompt: '¿Qué te interesa?',
          options: [
            { id: 'demo', label: 'Solo información', next: '__end__' },
            { id: 'llamar', label: 'Que me llamen', next: null },
          ],
        },
      ]),
    );

    expect(result.isOk()).toBe(true);
    expect(result.unwrap().toPrimitives().steps[0].options?.[0].next).toBe(
      '__end__',
    );
  });

  it('rechaza referencias a pasos que no existen', () => {
    const result = LeadCaptureFlow.create(
      buildFlow([
        { id: 'saludo', type: 'message', prompt: 'Hola', next: 'fantasma' },
      ]),
    );

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain('no existe');
  });

  it('rechaza bucles que dejarían al visitante dando vueltas', () => {
    const result = LeadCaptureFlow.create(
      buildFlow([
        { id: 'uno', type: 'message', prompt: 'Uno', next: 'dos' },
        { id: 'dos', type: 'message', prompt: 'Dos', next: 'uno' },
      ]),
    );

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain('bucle');
  });

  it('rechaza un paso de opciones sin opciones', () => {
    const result = LeadCaptureFlow.create(
      buildFlow([
        { id: 'elige', type: 'choice', prompt: '¿Qué prefieres?', options: [] },
      ]),
    );

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain('una opción');
  });

  it('rechaza un paso de texto sin campo de destino', () => {
    const result = LeadCaptureFlow.create(
      buildFlow([
        { id: 'nombre', type: 'text', prompt: '¿Cómo te llamas?', next: null },
      ]),
    );

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain('campo');
  });

  it('rechaza ids de paso repetidos', () => {
    const result = LeadCaptureFlow.create(
      buildFlow([
        { id: 'uno', type: 'message', prompt: 'Uno', next: null },
        { id: 'uno', type: 'message', prompt: 'Otro uno', next: null },
      ]),
    );

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain('repetido');
  });

  it('rechaza guiones más largos que el máximo', () => {
    const steps: LeadCaptureStepPrimitives[] = Array.from(
      { length: MAX_LEAD_CAPTURE_STEPS + 1 },
      (_, index) => ({
        id: `paso-${index}`,
        type: 'message' as const,
        prompt: `Paso ${index}`,
        next: null,
      }),
    );

    const result = LeadCaptureFlow.create(buildFlow(steps));

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toContain('pasos');
  });

  it('rechaza la tarjeta de inicio sin textos', () => {
    const flow = buildFlow([
      { id: 'saludo', type: 'message', prompt: 'Hola', next: null },
    ]);
    flow.intro = { title: '', body: '', ctaLabel: '' };

    const result = LeadCaptureFlow.create(flow);

    expect(result.isErr()).toBe(true);
  });

  it('deja fuera lo que no aplica a cada tipo de paso', () => {
    const result = LeadCaptureFlow.create(
      buildFlow([
        {
          id: 'elige',
          type: 'choice',
          prompt: '¿Qué te interesa?',
          options: [{ id: 'a', label: ' Coche nuevo ', next: null }],
          // El editor puede mandar restos de otro tipo de paso.
          field: 'email',
          next: 'elige',
        },
      ]),
    );

    expect(result.isOk()).toBe(true);
    const step = result.unwrap().toPrimitives().steps[0];
    expect(step.field).toBeUndefined();
    expect(step.next).toBeUndefined();
    expect(step.options?.[0].label).toBe('Coche nuevo');
  });
});
