import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { UserAuthController } from './user-auth.controller'
import { UserAuthService } from './user-auth.service'
import { UserAuthRepository } from './user-auth.repository'
import { UserAuthGuard } from './user-auth.guard'

/** 复用已配置的JWT签名设施，客户端认证与后台用户管理入口独立 */
@Module({
  imports: [AdminModule],
  controllers: [UserAuthController],
  providers: [UserAuthService, UserAuthRepository, UserAuthGuard],
  exports: [UserAuthService, UserAuthGuard]
})
export class UserAuthModule {}
