import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import type { Admin } from '@prisma/client'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../prisma/prisma.service'
import { AdminRepository } from './admin.repository'
import { LoginAdminDto } from './dto/login-admin.dto'
import { AdminPasswordDto } from './dto/admin-profile.dto'

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  /** 空库时初始化首个管理员，再校验账号状态、密码及 ADMIN 角色并签发令牌 */
  async login(dto: LoginAdminDto) {
    let admin = await this.adminRepository.findByUsername(dto.username)
    if (!admin && (await this.adminRepository.countAll()) === 0) {
      await this.initializeFirstAdmin(dto)
      admin = await this.adminRepository.findByUsername(dto.username)
    }

    if (!admin || !admin.status) {
      throw new UnauthorizedException('用户名或密码错误，或账号已禁用')
    }

    const passwordMatched = await bcrypt.compare(dto.password, admin.password)
    if (!passwordMatched) {
      throw new UnauthorizedException('用户名或密码错误，或账号已禁用')
    }

    if (admin.role !== 'ADMIN') throw new ForbiddenException('当前账号没有后台管理权限')

    const token = await this.jwtService.signAsync({
      sub: admin.id,
      username: admin.username,
      role: admin.role,
      ver: admin.tokenVersion ?? 0
    })

    return {
      token,
      userInfo: this.project(admin)
    }
  }

  /** 仅在后台账号表为空时创建首个管理员，并对并发事务冲突进行有限重试 */
  private async initializeFirstAdmin(dto: LoginAdminDto) {
    // 密码哈希放在事务外计算，避免延长数据库锁的持有时间。
    const password = await bcrypt.hash(dto.password, 12)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            if ((await this.adminRepository.countAll(tx)) !== 0) return
            await this.adminRepository.createInitial(dto.username, password, tx)
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
        return
      } catch (error) {
        // 其他请求已完成初始化时，交回常规登录流程验证本次凭据。
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || error.code === 'P2002')
        ) {
          if ((await this.adminRepository.countAll()) > 0) return
          if (attempt < 2) continue
        }
        throw error
      }
    }
  }

  /**
   * 按管理员编号重新校验账号状态及后台权限，返回不含密码的身份信息
   * @param id 从已验证的访问令牌中取得的管理员编号
   */
  async findCurrent(id: number, tokenVersion = 0) {
    const admin = await this.adminRepository.findById(id)
    if (!admin || !admin.status) throw new UnauthorizedException('登录已失效')
    if (admin.role !== 'ADMIN') throw new ForbiddenException('当前账号没有后台管理权限')
    if ((admin.tokenVersion ?? 0) !== tokenVersion)
      throw new UnauthorizedException('密码已变更，请重新登录')
    return this.project(admin)
  }

  /** 仅序列化可公开的当前管理员资料，不返回密码和令牌版本 */
  private project(admin: Admin) {
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      displayName: admin.displayName ?? '',
      userAvatarUrl: admin.avatarUrl ?? ''
    }
  }

  /** 保存当前管理员的显示名称或头像，不允许通过请求指定其他账号 */
  async updateProfile(id: number, data: { displayName?: string; avatarUrl?: string }) {
    try {
      return this.project(await this.adminRepository.updateProfile(id, data))
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new UnauthorizedException('账号已失效，请重新登录')
      throw error
    }
  }

  /** 验证原密码后更换当前管理员密码，竞争变更仅允许一次成功 */
  async updatePassword(id: number, dto: AdminPasswordDto) {
    const admin = await this.adminRepository.findById(id)
    if (!admin || !admin.status || admin.role !== 'ADMIN')
      throw new UnauthorizedException('登录已失效')
    if (!(await bcrypt.compare(dto.currentPassword, admin.password)))
      throw new BadRequestException('原密码不正确')
    if (dto.currentPassword === dto.newPassword)
      throw new BadRequestException('新密码不能与原密码相同')
    const password = await bcrypt.hash(dto.newPassword, 12)
    const result = await this.adminRepository.updatePassword(
      id,
      admin.password,
      admin.tokenVersion ?? 0,
      password
    )
    if (!result.count) throw new ConflictException('账号或密码已发生变化，请重新登录')
    return { changed: true }
  }
}
