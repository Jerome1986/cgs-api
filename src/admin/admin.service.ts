import { BadRequestException, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcrypt'
import { AdminRepository } from './admin.repository'
import { LoginAdminDto } from './dto/login-admin.dto'

@Injectable()
export class AdminService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly jwtService: JwtService
  ) {}

  async login(dto: LoginAdminDto) {
    const admin = await this.adminRepository.findByUsername(dto.username)
    if (!admin || !admin.status) {
      throw new BadRequestException('账号不存在或已禁用')
    }

    const passwordMatched = await bcrypt.compare(dto.password, admin.password)
    if (!passwordMatched) {
      throw new BadRequestException('密码错误')
    }

    const token = await this.jwtService.signAsync({
      sub: admin.id,
      username: admin.username,
      role: admin.role
    })

    return {
      token,
      userInfo: {
        id: admin.id,
        username: admin.username,
        role: admin.role
      }
    }
  }
}
