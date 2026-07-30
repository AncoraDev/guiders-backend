import {
  domainLookupCandidates,
  domainsMatch,
  normalizeDomainForMatching,
} from '../domain-matching.util';

describe('domain-matching.util', () => {
  describe('normalizeDomainForMatching', () => {
    it('elimina www y puerto', () => {
      expect(normalizeDomainForMatching('www.Example.com:8083')).toBe(
        'example.com',
      );
      expect(normalizeDomainForMatching('127.0.0.1:8083')).toBe('127.0.0.1');
      expect(normalizeDomainForMatching('localhost')).toBe('localhost');
    });

    it('no rompe hostnames con puntos', () => {
      expect(normalizeDomainForMatching('landing.mytech.com')).toBe(
        'landing.mytech.com',
      );
    });
  });

  describe('domainsMatch', () => {
    it('iguala host con y sin puerto', () => {
      expect(domainsMatch('127.0.0.1', '127.0.0.1:8083')).toBe(true);
      expect(domainsMatch('www.rmotion.es', 'rmotion.es:443')).toBe(true);
    });

    it('distingue hosts distintos', () => {
      expect(domainsMatch('a.com', 'b.com')).toBe(false);
    });
  });

  describe('domainLookupCandidates', () => {
    it('incluye dominio original y host sin puerto', () => {
      expect(domainLookupCandidates('127.0.0.1:8083')).toEqual(
        expect.arrayContaining(['127.0.0.1:8083', '127.0.0.1']),
      );
    });
  });
});
