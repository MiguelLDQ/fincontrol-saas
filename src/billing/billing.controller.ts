import { Controller, Post, Get, Param, Req, Res, UseGuards, RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('billing')
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: any) {
    return this.svc.getTenantStatus(req.tenantId);
  }

  @Post('pix')
  @UseGuards(JwtAuthGuard)
  generatePix(@Req() req: any) {
    return this.svc.generatePixCharge(req.tenantId);
  }

  @Post('confirm/:id')
  @UseGuards(JwtAuthGuard)
  confirm(@Param('id') id: string) {
    return this.svc.confirmPayment(id);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  history(@Req() req: any) {
    return this.svc.getBillingHistory(req.tenantId);
  }

  @Post('webhook/:gateway')
  async webhook(@Param('gateway') gateway: string, @Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    const sig = (req.headers['x-signature'] as string) ?? '';
    const result = await this.svc.handleWebhook(gateway, req.rawBody ?? Buffer.alloc(0), sig);
    res.json(result);
  }
}