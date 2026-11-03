import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AdminModule } from './admin/admin.module'
import { AppController } from './app.controller'
import { PrismaModule } from './prisma/prisma.module'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AdminModule],
  controllers: [AppController]
})
export class AppModule {}
