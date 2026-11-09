import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** 水印持久化访问，读取及更新均排除已删除配置 */
@Injectable()
export class WatermarkRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 按名称条件和编号倒序读取未删除水印 */
  findMany(where: Prisma.WatermarkWhereInput, skip: number, take: number) {
    return this.prisma.watermark.findMany({
      where: { ...where, deletedAt: null },
      skip,
      take,
      orderBy: { id: 'desc' }
    })
  }

  /** 统计同一名称筛选范围内的未删除水印 */
  count(where: Prisma.WatermarkWhereInput = {}) {
    return this.prisma.watermark.count({ where: { ...where, deletedAt: null } })
  }

  /** 按随机偏移读取可用水印，仅选择公开图片地址 */
  findAt(skip: number) {
    return this.prisma.watermark.findFirst({
      where: { deletedAt: null },
      skip,
      orderBy: { id: 'asc' },
      select: { imageUrl: true }
    })
  }

  /** 新增白名单映射后的水印名称与图片地址 */
  create(name: string, imageUrl: string) {
    return this.prisma.watermark.create({ data: { name, imageUrl } })
  }

  /** 原子更新仍未删除的水印，防止编辑恢复已删除记录 */
  update(id: number, data: Prisma.WatermarkUpdateInput) {
    return this.prisma.watermark.update({ where: { id, deletedAt: null }, data })
  }
}
