import {
  isCapturedWithoutAgent,
  resolveFollowUpStatus,
} from '../lead-follow-up';

describe('lead-follow-up', () => {
  it('detecta el rastro del asistente', () => {
    expect(
      isCapturedWithoutAgent({
        leadCapture: { capturedWithoutAgent: true },
      }),
    ).toBe(true);
    expect(isCapturedWithoutAgent({ leadCapture: {} })).toBe(false);
    expect(isCapturedWithoutAgent(undefined)).toBe(false);
  });

  it('un documento viejo sin status entra en Por tratar', () => {
    expect(
      resolveFollowUpStatus({
        leadCapture: { capturedWithoutAgent: true },
      }),
    ).toBe('pending');
    expect(resolveFollowUpStatus({ origen: 'manual' })).toBe('pending');
  });

  it('respeta el status persistido', () => {
    expect(
      resolveFollowUpStatus(
        { leadCapture: { capturedWithoutAgent: true } },
        'contacted',
      ),
    ).toBe('contacted');
  });
});
