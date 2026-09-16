/**
 * Mensaje de saludo del comercial (CTA Saludar en Atención).
 * Null = usar el texto por defecto del cliente.
 */
const MAX_LENGTH = 500;

export class UserAccountGreetingMessage {
  constructor(public readonly value: string | null) {
    if (value !== null && value.length > MAX_LENGTH) {
      throw new Error(
        `El mensaje de saludo no puede superar ${MAX_LENGTH} caracteres`,
      );
    }
  }

  public static fromInput(raw: string | null | undefined): UserAccountGreetingMessage {
    if (raw === undefined || raw === null) {
      return new UserAccountGreetingMessage(null);
    }
    const trimmed = raw.trim();
    return new UserAccountGreetingMessage(trimmed.length === 0 ? null : trimmed);
  }

  public getValue(): string | null {
    return this.value;
  }

  public equals(other: UserAccountGreetingMessage): boolean {
    return this.value === other.value;
  }
}
