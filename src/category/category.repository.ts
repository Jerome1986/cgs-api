import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 查询分类列表及直属父分类名称 */
  findMany(where: Prisma.CategoryWhereInput, skip?: number, take?: number) {
    return this.prisma.category.findMany({
      where,
      skip,
      take,
      include: { parent: { select: { name: true } } },
      orderBy: [{ sort: 'asc' }, { id: 'asc' }]
    })
  }

  /** 统计同一筛选条件下的分类总数 */
  count(where: Prisma.CategoryWhereInput) {
    return this.prisma.category.count({ where })
  }

  /** 按编号查询分类，可复用业务事务 */
  findOne(id: number, tx: Prisma.TransactionClient = this.prisma) {
    return tx.category.findUnique({ where: { id } })
  }

  /** 在事务内新增分类 */
  create(data: Prisma.CategoryUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.category.create({ data })
  }

  /** 更新分类名称与排序，不移动分类或更改类型 */
  update(id: number, data: { name: string; enName: string; sort: number }) {
    return this.prisma.category.update({ where: { id }, data })
  }

  /** 查询直属子分类数量，供删除前校验 */
  countChildren(id: number, tx: Prisma.TransactionClient) {
    return tx.category.count({ where: { parentId: id } })
  }

  /** 删除已确认无子分类的分类，外键限制阻止并发级联误删 */
  remove(id: number, tx: Prisma.TransactionClient) {
    return tx.category.delete({ where: { id } })
  }
}
