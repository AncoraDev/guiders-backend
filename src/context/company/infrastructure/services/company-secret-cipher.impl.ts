import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { CompanySecretCipher } from '../../domain/company-secret-cipher';

@Injectable()
export class CompanySecretCipherImpl implements CompanySecretCipher {
  private readonly logger = new Logger(CompanySecretCipherImpl.name);
  private readonly algorithm = 'aes-256-cbc';
  private readonly ivLength = 16;

  constructor(private readonly configService: ConfigService) {}

  encrypt(plainText: string): string {
    const key = this.getKey();
    if (!key) {
      this.logger.warn(
        'ENCRYPTION_KEY no configurada — la API key de Resend se guarda sin cifrar',
      );
      return plainText;
    }
    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, Buffer.from(key, 'hex'), iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  decrypt(value: string): string {
    if (!value) {
      return '';
    }
    const key = this.getKey();
    if (!key || value.indexOf(':') !== 32) {
      return value;
    }
    try {
      const iv = Buffer.from(value.slice(0, 32), 'hex');
      const encryptedData = value.slice(33);
      const decipher = createDecipheriv(
        this.algorithm,
        Buffer.from(key, 'hex'),
        iv,
      );
      return decipher.update(encryptedData, 'hex', 'utf8') + decipher.final('utf8');
    } catch (error) {
      this.logger.warn(
        `No se pudo descifrar el secreto de empresa: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return value;
    }
  }

  private getKey(): string | null {
    return this.configService.get<string>('ENCRYPTION_KEY') || null;
  }
}
