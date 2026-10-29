export class GetVisitorChatHistoryQuery {
  constructor(
    public readonly visitorId: string,
    public readonly companyId: string,
  ) {}
}
