import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
  ],
  providers: [AccountsService],
  controllers: [AccountsController],
})
export class AccountsModule {}