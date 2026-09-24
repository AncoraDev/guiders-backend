import { createHash, timingSafeEqual } from 'crypto';

export function demoAdminCredentialError(
  email: string,
  password: string,
): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@') || normalized.length < 3) {
    return 'El email de acceso a la demo no es válido';
  }
  if (password.length < 8) {
    return 'La contraseña de la demo debe tener al menos 8 caracteres';
  }
  return null;
}

export function sameSecret(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

export function providerDemoAdminMatches(
  storedEmail: string,
  storedPassword: string,
  email: string,
  password: string,
): boolean {
  const expectedEmail = storedEmail.trim().toLowerCase();
  const givenEmail = email.trim().toLowerCase();
  if (!expectedEmail || !storedPassword || !givenEmail || !password) {
    return false;
  }
  return (
    sameSecret(expectedEmail, givenEmail) &&
    sameSecret(storedPassword, password)
  );
}
