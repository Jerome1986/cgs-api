import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** 商品持久化访问，所有读取与更新排除软删除记录 */
@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 按统一筛选稳定读取商品列表 */
  findMany(where: Prisma.ProductWhereInput, skip?: number, take?: number) {
    return this.prisma.product.findMany({
      where,
      skip,
      take,
      orderBy: { id: 'asc' }
    })
  }

  /** 统计与列表相同范围的商品总数 */
  count(where: Prisma.ProductWhereInput) {
    return this.prisma.product.count({ where })
  }

  /** 新增经过业务层白名单映射的商品 */
  create(data: Prisma.ProductCreateInput) {
    return this.prisma.product.create({ data })
  }

  /** 原子修改尚未删除的指定商品 */
  update(id: number, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({ where: { id, deletedAt: null }, data })
  }
}
