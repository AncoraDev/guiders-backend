/** Captación a medias de un visitante, para reanudar el guion donde lo dejó. */
export class GetLeadCaptureSessionQuery {
  constructor(public readonly visitorId: string) {}
}
