import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const userSelect = {
  id: true,
  username: true,
  role: true,
  status: true,
  coins: true,
  dailyDownloadLimit: true,
  endDate: true,
  createdAt: true
} as const

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** 分页查询业务用户及总数，不读取管理员表 */
  async findPage(page: number, size: number, keyword = '') {
    const where: Prisma.UserWhereInput = keyword ? { username: { contains: keyword } } : {}
    const [list, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select: userSelect,
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * size,
        take: size
      }),
      this.prisma.user.count({ where })
    ])
    return { list, total }
  }

  /** 查询供现有本地搜索使用的业务用户公开列表 */
  findAll() {
    return this.prisma.user.findMany({ select: userSelect, orderBy: { id: 'desc' } })
  }

  /** 按主键查询业务用户，用于区分余额冲突与不存在 */
  findOne(id: number) {
    return this.prisma.user.findUnique({ where: { id }, select: userSelect })
  }

  /** 新增业务用户，状态固定启用，不操作后台管理员表 */
  create(username: string, role: string, coins: number) {
    return this.prisma.user.create({
      data: { username, role, coins, status: 1 },
      select: userSelect
    })
  }

  /** 在同一条SQL中校验原金币余额并更新资料，避免先查后改竞争 */
  update(
    id: number,
    data: Pick<
      Prisma.UserUpdateManyMutationInput,
      'username' | 'role' | 'coins' | 'dailyDownloadLimit' | 'endDate'
    >,
    expectedCoins?: number
  ) {
    return this.prisma.user.updateMany({
      where: { id, ...(expectedCoins !== undefined ? { coins: expectedCoins } : {}) },
      data
    })
  }

  /** 只修改指定业务用户的启禁用状态 */
  updateStatus(id: number, status: number) {
    return this.prisma.user.update({ where: { id }, data: { status }, select: userSelect })
  }

  /** 删除没有被历史业务外键引用的业务用户 */
  remove(id: number) {
    return this.prisma.user.delete({ where: { id }, select: { id: true } })
  }
}
