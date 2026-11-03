import { Body, Controller, Post } from '@nestjs/common'
import { AdminService } from './admin.service'
import { LoginAdminDto } from './dto/login-admin.dto'

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('login')
  login(@Body() dto: LoginAdminDto) {
    return this.adminService.login(dto)
  }
}
