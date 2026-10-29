/**
 * Chats ASSIGNED/ACTIVE cuyo comercial no está conectado.
 * Los ve quien sí está, para poder cubrirlos sin reclamarlos al abrir.
 */
export class GetAbsentAssigneeChatsQuery {
  constructor(
    public readonly companyId: string,
    public readonly requesterId: string,
    public readonly limit: number = 50,
  ) {}
}
