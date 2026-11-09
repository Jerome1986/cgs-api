import { MaterialModule } from './material/material.module'
import { ProductModule } from './product/product.module'
import { OrderModule } from './order/order.module'
import { WatermarkModule } from './watermark/watermark.module'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AdminModule } from './admin/admin.module'
import { AppController } from './app.controller'
import { PrismaModule } from './prisma/prisma.module'
import { UserModule } from './user/user.module'
import { TagModule } from './tag/tag.module'
import { CategoryModule } from './category/category.module'
import { UserAuthModule } from './user-auth/user-auth.module'
import { UserMaterialModule } from './user-material/user-material.module'

/** 应用根模块，统一加载全局配置、数据库及管理员业务模块 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AdminModule,
    UserModule,
    UserAuthModule,
    UserMaterialModule,
    CategoryModule,
    MaterialModule,
    ProductModule,
    OrderModule,
    WatermarkModule,
    TagModule
  ],
  controllers: [AppController]
})
export class AppModule {}
