import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { InvestmentsService } from './investments.service';
import { InvestmentsController } from './investments.controller';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [InvestmentsService],
  controllers: [InvestmentsController],
})
export class InvestmentsModule {}