import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { resolveCommercialCapture } from '../lead-capture-attribution';

describe('resolveCommercialCapture', () => {
  const commercialId = Uuid.random().value;

  it('atribuye al comercial cuando confirma la solicitud', () => {
    const result = resolveCommercialCapture({
      attributeCapture: true,
      commercialId,
      commercialName: 'Laura Pérez',
    });

    expect(result.capturedBy).toBe(commercialId);
    expect(result.capturedByName).toBe('Laura Pérez');
    expect(result.capturedAt).toBeInstanceOf(Date);
  });

  it('no atribuye si no es una confirmación', () => {
    expect(
      resolveCommercialCapture({
        commercialId,
        commercialName: 'Laura Pérez',
      }),
    ).toEqual({});
  });

  it('no pisa una atribución previa', () => {
    const previousId = Uuid.random().value;
    const previousAt = new Date('2026-01-01T00:00:00.000Z');

    expect(
      resolveCommercialCapture({
        existing: {
          capturedBy: previousId,
          capturedByName: 'Ana',
          capturedAt: previousAt,
        },
        attributeCapture: true,
        commercialId,
        commercialName: 'Laura Pérez',
      }),
    ).toEqual({
      capturedBy: previousId,
      capturedByName: 'Ana',
      capturedAt: previousAt,
    });
  });

  it('no atribuye un lead del asistente', () => {
    expect(
      resolveCommercialCapture({
        attributeCapture: true,
        commercialId,
        commercialName: 'Laura Pérez',
        additionalData: { leadCapture: { capturedWithoutAgent: true } },
      }),
    ).toEqual({});
  });
});
