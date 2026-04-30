import { Controller, Get, Post, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AccountsService, CreateAccountDto } from './accounts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('accounts')
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Get()
  findAll(@Req() req: any) { return this.svc.findAll(req.tenantId); }

  @Post()
  create(@Req() req: any, @Body() dto: CreateAccountDto) {
    return this.svc.create(req.tenantId, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(req.tenantId, id);
  }
}
