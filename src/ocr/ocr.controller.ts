import {
  Controller, Post, Get, Req, UseGuards,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('ocr')
@UseGuards(JwtAuthGuard)
export class OcrController {
  constructor(private readonly svc: OcrService) {}

  @Post('process')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async process(@Req() req: any, @UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    return this.svc.processImage(req.tenantId, file.buffer, file.mimetype, file.originalname);
  }

  @Get('history')
  history(@Req() req: any) { return this.svc.getHistory(req.tenantId); }
}