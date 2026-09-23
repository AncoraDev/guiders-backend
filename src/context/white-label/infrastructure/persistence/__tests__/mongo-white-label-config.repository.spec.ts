/**
 * Tests del repositorio MongoDB WhiteLabelConfig con campos embed
 *
 * Estrategia: usa un InMemoryModel que simula la API del Model de Mongoose
 * (findOneAndUpdate y findOne con lean+exec). Captura regresiones en
 * save() y findByCompanyId() con los campos embed.
 */

import { MongoWhiteLabelConfigRepositoryImpl } from '../mongo-white-label-config.repository.impl';
import { WhiteLabelConfig } from '../../../domain/entities/white-label-config';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

interface FakeDoc {
  _id?: { toString: () => string };
  companyId: string;
  colors: Record<string, string>;
  branding: Record<string, unknown>;
  typography: Record<string, unknown>;
  theme: string;
  embedEnabled?: unknown;
  embedAllowedOrigins?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

class InMemoryModel {
  public docs: FakeDoc[] = [];

  public findOneAndUpdate = (
    filter: { companyId: string },
    update: {
      $set: Record<string, unknown>;
      $setOnInsert?: Record<string, unknown>;
    },
    options: { upsert?: boolean; new?: boolean },
  ): Promise<FakeDoc | null> => {
    const existing = this.docs.find((d) => d.companyId === filter.companyId);
    if (existing) {
      Object.assign(existing, update.$set);
      return Promise.resolve(existing);
    }
    if (!options?.upsert) {
      return Promise.resolve(null);
    }
    const newDoc: FakeDoc = {
      _id: { toString: () => Uuid.random().value },
      companyId: filter.companyId,
      ...(Object.fromEntries(
        Object.entries(update.$set).filter(([k]) => k !== 'updatedAt'),
      ) as object),
      // En MongoDB real, $set gana sobre $setOnInsert para upserts; el operador
      // escribe el doc con $set fields, $setOnInsert solo se aplica si el campo
      // NO está en $set. Simulamos eso:
      ...Object.fromEntries(
        Object.entries(update.$setOnInsert ?? {}).filter(
          ([k]) => !(k in (update.$set ?? {})),
        ),
      ),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FakeDoc;
    this.docs.push(newDoc);
    return Promise.resolve(newDoc);
  };

  public findOne = (filter: {
    companyId: string;
  }): { lean: () => { exec: () => Promise<FakeDoc | null> } } => {
    const doc = this.docs.find((d) => d.companyId === filter.companyId) ?? null;
    return {
      lean: () => ({ exec: async () => doc }),
    };
  };
}

const COLORS = {
  primary: '#007bff',
  secondary: '#6c757d',
  tertiary: '#17a2b8',
  background: '#ffffff',
  surface: '#f8f9fa',
  text: '#212529',
  textMuted: '#6c757d',
};

const BRANDING = { logoUrl: null, faviconUrl: null, brandName: 'Test' };
const TYPOGRAPHY = {
  fontFamily: 'Inter',
  customFontName: null,
  customFontFiles: [],
};

function legacyDoc(companyId: string): FakeDoc {
  return {
    _id: { toString: () => Uuid.random().value },
    companyId,
    colors: COLORS,
    branding: BRANDING,
    typography: TYPOGRAPHY,
    theme: 'light',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('MongoWhiteLabelConfigRepositoryImpl - real path', () => {
  let inMemory: InMemoryModel;
  let repo: MongoWhiteLabelConfigRepositoryImpl;

  beforeEach(() => {
    inMemory = new InMemoryModel();
    // Cast: el InMemoryModel implementa la API que el repo usa
    repo = new MongoWhiteLabelConfigRepositoryImpl(
      inMemory as unknown as ConstructorParameters<
        typeof MongoWhiteLabelConfigRepositoryImpl
      >[0],
    );
  });

  it('save() — upsert brand new con embed → ok', async () => {
    const companyId = Uuid.random().value;
    const cfg = WhiteLabelConfig.createDefault(
      Uuid.random().value,
      companyId,
      'Test',
    ).update({
      embed: {
        embedEnabled: true,
        embedAllowedOrigins: ['https://app.integrator.com'],
      },
    });

    const result = await repo.save(cfg);

    expect(result.isOk()).toBe(true);
    expect(inMemory.docs).toHaveLength(1);
    const persisted = inMemory.docs[0];
    expect(persisted.embedEnabled).toBe(true);
    expect(persisted.embedAllowedOrigins).toEqual([
      'https://app.integrator.com',
    ]);
  });

  it('findByCompanyId() — legacy document sin campos embed → defaults', async () => {
    inMemory.docs.push(legacyDoc('legacy-company-id'));

    const result = await repo.findByCompanyId('legacy-company-id');

    expect(result.isOk()).toBe(true);
    const config = result.unwrap();
    expect(config.embedEnabled).toBe(false);
    expect(config.embedAllowedOrigins).toEqual([]);
  });

  it('findByCompanyId() — new document con embed habilitado → preserva', async () => {
    const companyId = Uuid.random().value;
    inMemory.docs.push({
      ...legacyDoc(companyId),
      embedEnabled: true,
      embedAllowedOrigins: ['https://app.integrator.com'],
    });

    const result = await repo.findByCompanyId(companyId);

    expect(result.isOk()).toBe(true);
    const config = result.unwrap();
    expect(config.embedEnabled).toBe(true);
    expect(config.embedAllowedOrigins).toEqual(['https://app.integrator.com']);
  });

  it('findByCompanyId() — embedEnabled="true" string corrupto → false (strict)', async () => {
    const companyId = Uuid.random().value;
    inMemory.docs.push({
      ...legacyDoc(companyId),
      embedEnabled: 'true' as unknown as boolean,
      embedAllowedOrigins: ['https://app.integrator.com'],
    });

    const result = await repo.findByCompanyId(companyId);

    expect(result.unwrap().embedEnabled).toBe(false);
  });

  it('findByCompanyId() — embedAllowedOrigins=null → [] (Array.isArray guard)', async () => {
    const companyId = Uuid.random().value;
    inMemory.docs.push({
      ...legacyDoc(companyId),
      embedEnabled: true,
      embedAllowedOrigins: null as unknown as string[],
    });

    const result = await repo.findByCompanyId(companyId);

    expect(result.unwrap().embedAllowedOrigins).toEqual([]);
  });
});
