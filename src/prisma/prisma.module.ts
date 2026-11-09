import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/** 全局提供共享 Prisma 客户端，由各业务 Repository 注入使用 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService]
})
export class PrismaModule {}
