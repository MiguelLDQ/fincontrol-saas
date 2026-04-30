import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('automation/rules')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private readonly svc: AutomationService) {}

  @Get()
  findAll(@Req() req: any) { return this.svc.findAll(req.tenantId); }

  @Post()
  create(@Req() req: any, @Body() dto: any) { return this.svc.create(req.tenantId, dto); }

  @Patch(':id/toggle')
  toggle(@Req() req: any, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.svc.toggle(req.tenantId, id, body.isActive);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) { return this.svc.remove(req.tenantId, id); }
}