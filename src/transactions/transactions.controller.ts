import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { TransactionsService, CreateTransactionDto } from './transactions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Get()
  findAll(@Req() req: any, @Query() q: any) {
    return this.svc.findAll(req.tenantId, q);
  }

  @Get('summary')
  summary(@Req() req: any, @Query('month') month?: string) {
    return this.svc.summary(req.tenantId, month);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.svc.findOne(req.tenantId, id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateTransactionDto) {
    return this.svc.create(req.tenantId, dto);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: Partial<CreateTransactionDto>) {
    return this.svc.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(req.tenantId, id);
  }
}
