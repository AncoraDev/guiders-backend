export const COMPANY_SECRET_CIPHER = Symbol('CompanySecretCipher');

export interface CompanySecretCipher {
  encrypt(plainText: string): string;
  decrypt(value: string): string;
}
