/**
 * Tests del Value Object WhiteLabelConfig con campos embed
 */

import {
  WhiteLabelConfig,
  WhiteLabelConfigPrimitives,
} from '../white-label-config';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('WhiteLabelConfig - campos embed', () => {
  describe('createDefault', () => {
    it('debería inicializar embedEnabled=false y embedAllowedOrigins=[] por defecto', () => {
      // Arrange
      const companyId = Uuid.random().value;

      // Act
      const config = WhiteLabelConfig.createDefault(
        companyId,
        companyId,
        'Mi Empresa',
      );

      // Assert
      expect(config).toBeInstanceOf(WhiteLabelConfig);
      expect(config.embedEnabled).toBe(false);
      expect(config.embedAllowedOrigins).toEqual([]);
    });
  });

  describe('toPrimitives', () => {
    it('debería serializar embedEnabled y embedAllowedOrigins', () => {
      // Arrange
      const companyId = Uuid.random().value;
      const config = WhiteLabelConfig.createDefault(
        companyId,
        companyId,
        'Mi Empresa',
      );
      const updated = config.update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.leadcars.com'],
        },
      });

      // Act
      const primitives = updated.toPrimitives();

      // Assert
      expect(primitives.embedEnabled).toBe(true);
      expect(primitives.embedAllowedOrigins).toEqual([
        'https://app.leadcars.com',
      ]);
    });
  });

  describe('fromPrimitives', () => {
    it('debería deserializar embedEnabled y embedAllowedOrigins cuando están presentes', () => {
      // Arrange
      const primitives: WhiteLabelConfigPrimitives = {
        id: Uuid.random().value,
        companyId: Uuid.random().value,
        colors: {
          primary: '#007bff',
          secondary: '#6c757d',
          tertiary: '#17a2b8',
          background: '#ffffff',
          surface: '#f8f9fa',
          text: '#212529',
          textMuted: '#6c757d',
        },
        branding: {
          logoUrl: null,
          faviconUrl: null,
          brandName: 'Test',
        },
        typography: {
          fontFamily: 'Inter',
          customFontName: null,
          customFontFiles: [],
        },
        theme: 'light',
        embedEnabled: true,
        embedAllowedOrigins: [
          'https://app.leadcars.com',
          'https://staging.leadcars.com',
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Act
      const config = WhiteLabelConfig.fromPrimitives(primitives);

      // Assert
      expect(config.embedEnabled).toBe(true);
      expect(config.embedAllowedOrigins).toEqual([
        'https://app.leadcars.com',
        'https://staging.leadcars.com',
      ]);
    });

    it('debería aplicar defaults embedEnabled=false y embedAllowedOrigins=[] cuando no están en primitivos', () => {
      // Arrange — simula documento legacy SIN los nuevos campos
      const primitives: Partial<WhiteLabelConfigPrimitives> = {
        id: Uuid.random().value,
        companyId: Uuid.random().value,
        colors: {
          primary: '#007bff',
          secondary: '#6c757d',
          tertiary: '#17a2b8',
          background: '#ffffff',
          surface: '#f8f9fa',
          text: '#212529',
          textMuted: '#6c757d',
        },
        branding: {
          logoUrl: null,
          faviconUrl: null,
          brandName: 'Test',
        },
        typography: {
          fontFamily: 'Inter',
          customFontName: null,
          customFontFiles: [],
        },
        theme: 'light',
      };

      // Act
      const config = WhiteLabelConfig.fromPrimitives(
        primitives as WhiteLabelConfigPrimitives,
      );

      // Assert
      expect(config.embedEnabled).toBe(false);
      expect(config.embedAllowedOrigins).toEqual([]);
    });
  });

  describe('roundtrip toPrimitives/fromPrimitives', () => {
    it('debería preservar embedEnabled y embedAllowedOrigins en roundtrip', () => {
      // Arrange
      const companyId = Uuid.random().value;
      const original = WhiteLabelConfig.createDefault(
        companyId,
        companyId,
        'Mi Empresa',
      ).update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: [
            'https://app.integrator.com',
            'https://staging.integrator.com',
          ],
        },
      });

      // Act
      const roundtrip = WhiteLabelConfig.fromPrimitives(
        original.toPrimitives(),
      );

      // Assert
      expect(roundtrip.embedEnabled).toBe(original.embedEnabled);
      expect(roundtrip.embedAllowedOrigins).toEqual(
        original.embedAllowedOrigins,
      );
    });
  });

  describe('update() - preserve semantics (PATCH partial)', () => {
    it('debería preservar embedAllowedOrigins al omitir embed en update()', () => {
      // Arrange
      const companyId = Uuid.random().value;
      const withOrigins = WhiteLabelConfig.createDefault(
        companyId,
        companyId,
        'Test',
      ).update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.integrator.com'],
        },
      });

      // Act — update sin tocar embed
      const updated = withOrigins.update({ theme: 'dark' });

      // Assert
      expect(updated.embedEnabled).toBe(true);
      expect(updated.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
      ]);
      expect(updated.theme).toBe('dark');
    });

    it('debería preservar embedEnabled al pasar solo embedAllowedOrigins en update()', () => {
      // Arrange
      const companyId = Uuid.random().value;
      const enabled = WhiteLabelConfig.createDefault(
        companyId,
        companyId,
        'Test',
      ).update({ embed: { embedEnabled: true, embedAllowedOrigins: [] } });

      // Act
      const updated = enabled.update({
        embed: { embedAllowedOrigins: ['https://app.integrator.com'] },
      });

      // Assert
      expect(updated.embedEnabled).toBe(true);
      expect(updated.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
      ]);
    });

    it('debería limpiar embedAllowedOrigins al pasar array vacío explícito en update()', () => {
      // Arrange
      const companyId = Uuid.random().value;
      const populated = WhiteLabelConfig.createDefault(
        companyId,
        companyId,
        'Test',
      ).update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.integrator.com'],
        },
      });

      // Act
      const cleared = populated.update({
        embed: { embedAllowedOrigins: [] },
      });

      // Assert
      expect(cleared.embedAllowedOrigins).toEqual([]);
    });
  });

  describe('defensive immutability (F9)', () => {
    it('getter embedAllowedOrigins debe retornar copia defensiva (no referencia interna)', () => {
      // Arrange
      const companyId = Uuid.random().value;
      const config = WhiteLabelConfig.createDefault(
        companyId,
        companyId,
        'Test',
      ).update({
        embed: {
          embedEnabled: true,
          embedAllowedOrigins: ['https://app.integrator.com'],
        },
      });

      // Act
      const firstCall = config.embedAllowedOrigins;
      firstCall.push('https://evil.com');

      // Assert
      expect(config.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
      ]);
    });

    it('constructor no debe compartir referencia de array externo (F9)', () => {
      // Arrange
      const externalArray = ['https://app.integrator.com'];
      const primitives: WhiteLabelConfigPrimitives = {
        id: Uuid.random().value,
        companyId: Uuid.random().value,
        colors: {
          primary: '#007bff',
          secondary: '#6c757d',
          tertiary: '#17a2b8',
          background: '#ffffff',
          surface: '#f8f9fa',
          text: '#212529',
          textMuted: '#6c757d',
        },
        branding: {
          logoUrl: null,
          faviconUrl: null,
          brandName: 'Test',
        },
        typography: {
          fontFamily: 'Inter',
          customFontName: null,
          customFontFiles: [],
        },
        theme: 'light',
        embedEnabled: true,
        embedAllowedOrigins: externalArray,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Act
      const config = WhiteLabelConfig.fromPrimitives(primitives);
      externalArray.push('https://evil.com');

      // Assert
      expect(config.embedAllowedOrigins).toEqual([
        'https://app.integrator.com',
      ]);
    });
  });
});
