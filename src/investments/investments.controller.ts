import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private readonly svc: InvestmentsService) {}

  @Get()
  getPortfolio(@Req() req: any) { return this.svc.getPortfolio(req.tenantId); }

  @Get('summary')
  getSummary(@Req() req: any) { return this.svc.getSummary(req.tenantId); }

  @Post()
  create(@Req() req: any, @Body() dto: any) { return this.svc.create(req.tenantId, dto); }

  @Post(':id/price')
  addPrice(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.svc.addPrice(req.tenantId, id, body.price, body.source);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) { return this.svc.remove(req.tenantId, id); }
}