import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { AdminController } from './admin.controller'
import { AdminRepository } from './admin.repository'
import { AdminService } from './admin.service'
import { AdminAuthGuard } from './admin-auth.guard'

/** 装配管理员登录与认证依赖，向其他模块提供后台身份校验能力 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // 缺少签名密钥时终止初始化，避免使用隐式默认密钥签发令牌。
        const secret = configService.get<string>('JWT_SECRET')
        if (!secret) {
          throw new Error('JWT_SECRET is required')
        }

        return {
          secret,
          signOptions: { expiresIn: configService.get('JWT_EXPIRES_IN', '7d') }
        }
      }
    })
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository, AdminAuthGuard],
  exports: [AdminAuthGuard, JwtModule, AdminService]
})
export class AdminModule {}
