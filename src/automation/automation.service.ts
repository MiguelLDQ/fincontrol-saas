import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.automationRule.findMany({
      where: { tenantId },
      orderBy: { priority: 'desc' },
    });
  }

  create(tenantId: string, dto: any) {
    return this.prisma.automationRule.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 0,
        conditions: dto.conditions,
        actions: dto.actions,
        triggerOn: dto.triggerOn ?? ['TRANSACTION_CREATED'],
      },
    });
  }

  async toggle(tenantId: string, id: string, isActive: boolean) {
    await this.prisma.automationRule.updateMany({
      where: { id, tenantId },
      data: { isActive },
    });
    return { message: `Regra ${isActive ? 'ativada' : 'desativada'}.` };
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.automationRule.deleteMany({ where: { id, tenantId } });
    return { message: 'Regra removida.' };
  }
}