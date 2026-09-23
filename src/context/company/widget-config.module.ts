import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CompanyModule } from './company.module';
import { AuthVisitorModule } from '../auth/auth-visitor/infrastructure/auth-visitor.module';
import { WidgetConfigController } from './infrastructure/controllers/widget-config.controller';

@Module({
  imports: [CqrsModule, CompanyModule, AuthVisitorModule],
  controllers: [WidgetConfigController],
})
export class WidgetConfigModule {}
