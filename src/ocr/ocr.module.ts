import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
import { OcrController } from './ocr.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }),
  ],
  providers: [OcrService],
  controllers: [OcrController],
})
export class OcrModule {}