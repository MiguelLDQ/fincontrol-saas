import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingScheduler } from './billing.scheduler';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    ScheduleModule.forRoot(),
  ],
  providers: [BillingService, BillingScheduler],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}