import { describe, it, expect } from '@jest/globals';
import {
  LogoutCascadeResult,
  LogoutCascadeResultValue,
} from '../logout-cascade-result';

describe('LogoutCascadeResultValue (unit) - Story 2.3', () => {
  describe('factories', () => {
    it('debe crear un LogoutCascadeResultValue SUCCESS', () => {
      const value = LogoutCascadeResultValue.success();
      expect(value.value).toBe(LogoutCascadeResult.SUCCESS);
    });

    it('debe crear un LogoutCascadeResultValue PARTIAL', () => {
      const value = LogoutCascadeResultValue.partial();
      expect(value.value).toBe(LogoutCascadeResult.PARTIAL);
    });

    it('debe crear un LogoutCascadeResultValue NOT_FOUND', () => {
      const value = LogoutCascadeResultValue.notFound();
      expect(value.value).toBe(LogoutCascadeResult.NOT_FOUND);
    });

    it('debe crear un LogoutCascadeResultValue FAILURE', () => {
      const value = LogoutCascadeResultValue.failure();
      expect(value.value).toBe(LogoutCascadeResult.FAILURE);
    });
  });

  describe('toJSON', () => {
    it('debe serializar SUCCESS como "success"', () => {
      const value = LogoutCascadeResultValue.success();
      expect(value.toJSON()).toBe('success');
    });

    it('debe serializar PARTIAL como "partial"', () => {
      const value = LogoutCascadeResultValue.partial();
      expect(value.toJSON()).toBe('partial');
    });

    it('debe serializar NOT_FOUND como "not_found"', () => {
      const value = LogoutCascadeResultValue.notFound();
      expect(value.toJSON()).toBe('not_found');
    });

    it('debe serializar FAILURE como "failure"', () => {
      const value = LogoutCascadeResultValue.failure();
      expect(value.toJSON()).toBe('failure');
    });
  });

  describe('equality', () => {
    it('debe considerar iguales dos SUCCESS', () => {
      const a = LogoutCascadeResultValue.success();
      const b = LogoutCascadeResultValue.success();
      expect(a.equals(b)).toBe(true);
    });

    it('debe considerar diferentes SUCCESS y PARTIAL', () => {
      const a = LogoutCascadeResultValue.success();
      const b = LogoutCascadeResultValue.partial();
      expect(a.equals(b)).toBe(false);
    });
  });
});
