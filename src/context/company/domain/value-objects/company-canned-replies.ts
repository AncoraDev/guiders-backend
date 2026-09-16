import {
  CannedReplyPrimitives,
  COMPANY_CANNED_REPLIES_MAX,
  parseCannedReplies,
} from 'src/context/shared/domain/canned-reply';

export class CompanyCannedReplies {
  constructor(public readonly value: CannedReplyPrimitives[]) {}

  public static empty(): CompanyCannedReplies {
    return new CompanyCannedReplies([]);
  }

  public static fromInput(raw: unknown): CompanyCannedReplies {
    return new CompanyCannedReplies(
      parseCannedReplies(raw, COMPANY_CANNED_REPLIES_MAX),
    );
  }

  public getValue(): CannedReplyPrimitives[] {
    return this.value;
  }
}
