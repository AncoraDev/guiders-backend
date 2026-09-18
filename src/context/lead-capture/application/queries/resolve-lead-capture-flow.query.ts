/**
 * Guion que debe recorrer el visitante. Solo devuelve algo si la empresa lo
 * tiene activo, para que el SDK no muestre guiones a medio montar.
 */
export class ResolveLeadCaptureFlowQuery {
  constructor(public readonly companyId: string) {}
}
