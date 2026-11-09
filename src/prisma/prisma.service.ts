import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@prisma/client'

/** 使用环境配置创建数据库客户端，并随模块生命周期管理连接 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL')
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required')
    }

    super({ adapter: new PrismaMariaDb(databaseUrl) })
  }

  /** 模块初始化时建立数据库连接，使连接错误在应用启动阶段暴露 */
  async onModuleInit() {
    await this.$connect()
  }

  /** 模块销毁钩子执行时断开数据库连接，释放客户端资源 */
  async onModuleDestroy() {
    await this.$disconnect()
  }
}
