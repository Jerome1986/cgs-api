import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { UserRepository } from './user.repository'
import { QueryUserDto } from './dto/query-user.dto'
import { CreateUserDto, UpdateUserDto } from './dto/write-user.dto'

@Injectable()
export class UserService {
  constructor(private readonly repository: UserRepository) {}

  /** 返回后台首页的业务用户分页结果 */
  findPage(query: QueryUserDto) {
    return this.repository.findPage(query.pagesNum, query.pagesSize, query.keyword)
  }

  /** 返回后台本地搜索所需业务用户列表 */
  findAll() {
    return this.repository.findAll()
  }

  /** 将账号重复、缺失及历史订单关联转换为明确的业务错误 */
  private async write<T>(operation: () => Promise<T>) {
    try {
      return await operation()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('用户名已存在')
        if (error.code === 'P2025') throw new NotFoundException('用户不存在')
        if (error.code === 'P2003')
          throw new ConflictException('用户已有历史业务记录，请使用禁用操作')
      }
      throw error
    }
  }

  /** 创建启用的业务用户，仅写入明确允许的资料与初始余额 */
  async create(dto: CreateUserDto) {
    const user = await this.write(() => this.repository.create(dto.username, dto.role, dto.coins))
    return { acknowledged: true, insertedId: user.id }
  }

  /** 只在原余额一致时执行人工余额修改，未提交coins时保留当前余额 */
  async update(dto: UpdateUserDto) {
    const result = await this.write(() =>
      this.repository.update(
        dto.id,
        {
          username: dto.username,
          role: dto.role,
          ...(dto.coins !== undefined ? { coins: dto.coins } : {}),
          ...(dto.dailyDownloadLimit !== undefined
            ? { dailyDownloadLimit: dto.dailyDownloadLimit }
            : {}),
          ...(dto.endDate !== undefined
            ? { endDate: dto.endDate === null ? null : new Date(dto.endDate) }
            : {})
        },
        dto.expectedCoins
      )
    )
    if (!result.count) {
      if (!(await this.repository.findOne(dto.id))) throw new NotFoundException('用户不存在')
      throw new ConflictException('金币余额已发生变化，请关闭编辑窗口并刷新后重试')
    }
    return { acknowledged: true, matchedCount: 1 }
  }

  /** 修改业务用户状态，不影响独立的后台管理员账号 */
  async updateStatus(id: number, status: number) {
    await this.write(() => this.repository.updateStatus(id, status))
    return { acknowledged: true, matchedCount: 1 }
  }

  /** 删除业务用户，数据库外键阻止删除有历史订单的用户 */
  async remove(id: number) {
    await this.write(() => this.repository.remove(id))
    return { acknowledged: true, deletedCount: 1 }
  }
}
