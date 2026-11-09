import { Body, Controller, Get, HttpCode, Patch, Post, Put, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'
import { AdminAuthGuard } from './admin-auth.guard'
import { AdminService } from './admin.service'
import { LoginAdminDto } from './dto/login-admin.dto'
import { AdminAvatarDto, AdminPasswordDto, AdminProfileDto } from './dto/admin-profile.dto'

/** 由现有管理员守卫写入的可信当前身份 */
type AdminRequest = Request & {
  /** 当前管理员公开资料，不含密码 */
  admin: Awaited<ReturnType<AdminService['findCurrent']>>
}

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** 使用管理员账号和密码登录后台，返回访问令牌及管理员信息 */
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginAdminDto) {
    return this.adminService.login(dto)
  }

  /** 获取通过身份校验的当前管理员信息，供页面恢复登录状态 */
  @Get('me')
  @UseGuards(AdminAuthGuard)
  me(
    @Req()
    request: Request & {
      /** 由管理员认证守卫校验后写入的当前管理员信息 */
      admin: Awaited<ReturnType<AdminService['findCurrent']>>
    }
  ) {
    return request.admin
  }

  /** 修改当前管理员的显示名称 */
  @Patch('me')
  @UseGuards(AdminAuthGuard)
  updateProfile(@Req() request: AdminRequest, @Body() dto: AdminProfileDto) {
    return this.adminService.updateProfile(request.admin.id, { displayName: dto.displayName })
  }

  /** 修改当前管理员头像，上传复用现有受保护的图片接口 */
  @Patch('me/avatar')
  @UseGuards(AdminAuthGuard)
  updateAvatar(@Req() request: AdminRequest, @Body() dto: AdminAvatarDto) {
    return this.adminService.updateProfile(request.admin.id, { avatarUrl: dto.avatarUrl })
  }

  /** 验证原密码后更换当前管理员密码，使旧访问令牌失效 */
  @Put('me/password')
  @UseGuards(AdminAuthGuard)
  updatePassword(@Req() request: AdminRequest, @Body() dto: AdminPasswordDto) {
    return this.adminService.updatePassword(request.admin.id, dto)
  }
}
