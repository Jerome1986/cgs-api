import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string) {
    return this.prisma.admin.findUnique({ where: { username } })
  }
}
