import { Test, TestingModule } from '@nestjs/testing';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ChatV2Controller } from '../chat-v2.controller';
import { JoinWaitingRoomCommand } from '../../../application/commands/join-waiting-room.command';
import { CreateChatRequestDto } from '../../../application/dtos/create-chat-request.dto';
import { AuthenticatedRequest } from 'src/context/shared/infrastructure/guards/auth.guard';
import { AuthGuard } from 'src/context/shared/infrastructure/guards/auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { TokenVerifyService } from 'src/context/shared/infrastructure/token-verify.service';
import { VisitorSessionAuthService } from 'src/context/shared/infrastructure/services/visitor-session-auth.service';
import { BffSessionAuthService } from 'src/context/shared/infrastructure/services/bff-session-auth.service';
import { HttpException } from '@nestjs/common';
import { ChatAttendedByOtherCommercialError } from '../../../domain/errors/chat.error';

describe('ChatV2Controller', () => {
  let controller: ChatV2Controller;
  let commandBus: CommandBus;

  const mockCommandBus = {
    execute: jest.fn(),
  };

  const mockQueryBus = {
    execute: jest.fn(),
  };

  const mockAuthGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  const mockRolesGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  const mockTokenVerifyService = {
    verifyToken: jest.fn(),
  };

  const mockVisitorSessionAuthService = {
    authenticateVisitor: jest.fn(),
  };

  const mockBffSessionAuthService = {
    extractBffSessionTokens: jest.fn(),
    validateBffSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatV2Controller],
      providers: [
        {
          provide: CommandBus,
          useValue: mockCommandBus,
        },
        {
          provide: QueryBus,
          useValue: mockQueryBus,
        },
        {
          provide: TokenVerifyService,
          useValue: mockTokenVerifyService,
        },
        {
          provide: VisitorSessionAuthService,
          useValue: mockVisitorSessionAuthService,
        },
        {
          provide: BffSessionAuthService,
          useValue: mockBffSessionAuthService,
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    controller = module.get<ChatV2Controller>(ChatV2Controller);
    commandBus = module.get<CommandBus>(CommandBus);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createChat', () => {
    it('should create a chat successfully', async () => {
      // Arrange
      const mockRequest = {
        user: {
          id: 'visitor-123',
          roles: ['visitor'],
          username: 'visitor',
          companyId: 'company-456',
        },
        headers: {},
      } as AuthenticatedRequest;

      const createChatDto: CreateChatRequestDto = {
        visitorInfo: {
          name: 'Juan Pérez',
          email: 'juan@example.com',
        },
        metadata: {
          department: 'ventas',
          source: 'website',
        },
      };

      const expectedResult = {
        chatId: 'chat-789',
        position: 1,
      };

      mockCommandBus.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.createChat(createChatDto, mockRequest);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        new JoinWaitingRoomCommand(
          'visitor-123',
          createChatDto.visitorInfo,
          createChatDto.metadata,
          'company-456',
          'visitor-123',
        ),
      );
      expect(result).toEqual(expectedResult);
    });

    it('should create a chat without optional data', async () => {
      // Arrange
      const mockRequest = {
        user: {
          id: 'visitor-123',
          roles: ['visitor'],
          username: 'visitor',
          companyId: 'company-456',
        },
        headers: {},
      } as AuthenticatedRequest;

      const createChatDto: CreateChatRequestDto = {};

      const expectedResult = {
        chatId: 'chat-789',
        position: 1,
      };

      mockCommandBus.execute.mockResolvedValue(expectedResult);

      // Act
      const result = await controller.createChat(createChatDto, mockRequest);

      // Assert
      expect(commandBus.execute).toHaveBeenCalledWith(
        new JoinWaitingRoomCommand(
          'visitor-123',
          {},
          {},
          'company-456',
          'visitor-123',
        ),
      );
      expect(result).toEqual(expectedResult);
    });

    it('should handle errors from command execution', async () => {
      // Arrange
      const mockRequest = {
        user: {
          id: 'visitor-123',
          roles: ['visitor'],
          username: 'visitor',
          companyId: 'company-456',
        },
        headers: {},
      } as AuthenticatedRequest;

      const createChatDto: CreateChatRequestDto = {
        visitorInfo: {
          name: 'Juan Pérez',
        },
      };

      const error = new Error('Command execution failed');
      mockCommandBus.execute.mockRejectedValue(error);

      // Act & Assert
      await expect(
        controller.createChat(createChatDto, mockRequest),
      ).rejects.toThrow('Error interno del servidor');

      expect(commandBus.execute).toHaveBeenCalledWith(
        new JoinWaitingRoomCommand(
          'visitor-123',
          createChatDto.visitorInfo,
          {},
          'company-456',
          'visitor-123',
        ),
      );
    });

    it('responde 409 si otro comercial ya atiende al visitante', async () => {
      const mockRequest = {
        user: {
          id: '6f1a7c18-2e8e-4d3a-9b4f-2bb2b5f8a111',
          roles: ['commercial'],
          username: 'comercial',
          companyId: 'company-456',
        },
        headers: {},
      } as AuthenticatedRequest;

      mockCommandBus.execute.mockRejectedValue(
        new ChatAttendedByOtherCommercialError(),
      );

      await expect(
        controller.createChat(
          {
            visitorInfo: {
              visitorId: '550e8400-e29b-41d4-a716-446655440000',
            },
          },
          mockRequest,
        ),
      ).rejects.toBeInstanceOf(HttpException);

      try {
        await controller.createChat(
          {
            visitorInfo: {
              visitorId: '550e8400-e29b-41d4-a716-446655440000',
            },
          },
          mockRequest,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(409);
        expect((error as HttpException).message).toBe(
          'Este visitante ya está en conversación con otro comercial',
        );
      }
    });
  });

  describe('DTO validation', () => {
    it('should validate visitor info correctly', () => {
      const dto = new CreateChatRequestDto();
      dto.visitorInfo = {
        name: 'Juan Pérez',
        email: 'juan@example.com',
        phone: '+1234567890',
        location: 'Madrid, España',
        additionalData: { company: 'Acme Corp' },
      };

      expect(dto.visitorInfo.name).toBe('Juan Pérez');
      expect(dto.visitorInfo.email).toBe('juan@example.com');
      expect(dto.visitorInfo.phone).toBe('+1234567890');
      expect(dto.visitorInfo.location).toBe('Madrid, España');
      expect(dto.visitorInfo.additionalData).toEqual({ company: 'Acme Corp' });
    });

    it('should validate metadata correctly', () => {
      const dto = new CreateChatRequestDto();
      dto.metadata = {
        department: 'ventas',
        source: 'website',
        initialUrl: 'https://example.com/productos',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        referrer: 'https://google.com',
        tags: { utm_source: 'google', campaign: 'summer2024' },
        customFields: { priority_level: 'high', product_interest: 'premium' },
      };

      expect(dto.metadata.department).toBe('ventas');
      expect(dto.metadata.source).toBe('website');
      expect(dto.metadata.initialUrl).toBe('https://example.com/productos');
      expect(dto.metadata.userAgent).toBe(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      );
      expect(dto.metadata.referrer).toBe('https://google.com');
      expect(dto.metadata.tags).toEqual({
        utm_source: 'google',
        campaign: 'summer2024',
      });
      expect(dto.metadata.customFields).toEqual({
        priority_level: 'high',
        product_interest: 'premium',
      });
    });

    it('should handle empty DTO', () => {
      const dto = new CreateChatRequestDto();
      expect(dto.visitorInfo).toBeUndefined();
      expect(dto.metadata).toBeUndefined();
    });
  });
});
