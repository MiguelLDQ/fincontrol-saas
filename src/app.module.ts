import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesModule } from './categories/categories.module';
import { InvestmentsModule } from './investments/investments.module';
import { AutomationModule } from './automation/automation.module';
import { OcrModule } from './ocr/ocr.module';
import { AiModule } from './ai/ai.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    EncryptionModule,
    AuthModule,
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    InvestmentsModule,
    AutomationModule,
    OcrModule,
    AiModule,
    BillingModule,
  ],
})
export class AppModule {}