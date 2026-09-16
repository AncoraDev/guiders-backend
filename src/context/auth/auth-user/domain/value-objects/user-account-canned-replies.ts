import {
  CannedReplyPrimitives,
  USER_CANNED_REPLIES_MAX,
  parseCannedReplies,
} from 'src/context/shared/domain/canned-reply';

export class UserAccountCannedReplies {
  constructor(public readonly value: CannedReplyPrimitives[]) {}

  public static empty(): UserAccountCannedReplies {
    return new UserAccountCannedReplies([]);
  }

  public static fromInput(raw: unknown): UserAccountCannedReplies {
    return new UserAccountCannedReplies(
      parseCannedReplies(raw, USER_CANNED_REPLIES_MAX),
    );
  }

  public getValue(): CannedReplyPrimitives[] {
    return this.value;
  }
}
