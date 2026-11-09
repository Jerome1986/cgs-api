import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import type { User } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { UserAuthRepository } from './user-auth.repository'
import { UserCredentialsDto } from './dto/user-auth.dto'

@Injectable()
export class UserAuthService {
  constructor(
    private readonly repository: UserAuthRepository,
    private readonly jwt: JwtService
  ) {}

  /** 哈希密码后注册普通用户，由唯一索引处理并发重名，不接管已有无密码账号 */
  async register(dto: UserCredentialsDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12)
    try {
      const row = await this.repository.create(dto.username, passwordHash)
      return { _id: String(row.id), username: row.username }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('用户名已存在')
      throw error
    }
  }

  /** 校验密码和启用状态，签发与管理员角色隔离的客户端令牌 */
  async login(dto: UserCredentialsDto) {
    const row = await this.repository.findByUsername(dto.username)
    if (
      !row?.passwordHash ||
      row.status !== 1 ||
      !(await bcrypt.compare(dto.password, row.passwordHash))
    )
      throw new UnauthorizedException('用户名或密码错误，或账号不可用')
    const token = await this.jwt.signAsync({ sub: row.id, role: 'USER' })
    return { ...this.project(row), token }
  }

  /** 每次认证复查用户是否存在、启用且已设置密码，使禁用和删除即时生效 */
  async findCurrent(id: number) {
    const row = await this.repository.findById(id)
    if (!row || row.status !== 1 || !row.passwordHash)
      throw new UnauthorizedException('登录已失效，请重新登录')
    return this.project(row)
  }

  /** 白名单输出客户端资料，不返回密码哈希或授予后台权限 */
  private project(row: User) {
    return {
      _id: String(row.id),
      username: row.username,
      role: row.role,
      status: row.status,
      coins: row.coins,
      dailyDownloadLimit: row.dailyDownloadLimit ?? 0,
      endDate: row.endDate,
      userAvatarUrl: '',
      createdAt: row.createdAt
    }
  }
}
