import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [AutomationService],
  controllers: [AutomationController],
})
export class AutomationModule {}