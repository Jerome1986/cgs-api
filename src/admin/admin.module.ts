import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtModule } from '@nestjs/jwt'
import { AdminController } from './admin.controller'
import { AdminRepository } from './admin.repository'
import { AdminService } from './admin.service'

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
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
  providers: [AdminService, AdminRepository]
})
export class AdminModule {}
