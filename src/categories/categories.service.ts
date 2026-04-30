import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryType } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, type?: string) {
    return this.prisma.category.findMany({
      where: { tenantId, ...(type ? { type: type as CategoryType } : {}) },
      include: { children: true },
      orderBy: { name: 'asc' },
    });
  }

  create(tenantId: string, dto: { name: string; type: CategoryType; color?: string; icon?: string; parentId?: string }) {
    return this.prisma.category.create({ data: { tenantId, ...dto } });
  }

  async update(tenantId: string, id: string, dto: any) {
    const cat = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    const cat = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Categoria removida.' };
  }
}