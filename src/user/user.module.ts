import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module'
import { UserController } from './user.controller'
import { UserService } from './user.service'
import { UserRepository } from './user.repository'

@Module({
  imports: [AdminModule],
  controllers: [UserController],
  providers: [UserService, UserRepository]
})
export class UserModule {}
