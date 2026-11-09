import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import type { App } from 'supertest/types'
import request from 'supertest'
import { UserController } from './user.controller'
import { UserRepository } from './user.repository'
import { UserService } from './user.service'
import { PrismaService } from '../prisma/prisma.service'
import { AdminAuthGuard } from '../admin/admin-auth.guard'
import { setupApp } from '../setup-app'

describe('用户名称搜索与分页范围（隔离数据库）', () => {
  let app: INestApplication<App>
  const findMany = jest.fn().mockResolvedValue([{ id: 7, username: 'a[b' }])
  const count = jest.fn().mockResolvedValue(21)
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        UserService,
        UserRepository,
        {
          provide: PrismaService,
          useValue: {
            user: { findMany, count },
            $transaction: (queries: Promise<unknown>[]) => Promise.all(queries)
          }
        }
      ]
    })
      .overrideGuard(AdminAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()
    app = module.createNestApplication()
    setupApp(app)
    await app.init()
  })
  afterAll(async () => app.close())
  beforeEach(() => jest.clearAllMocks())

  it('关键词去空格后与分页一起下推，列表和总数同条件，特殊字符按字符串处理', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/user-get')
      .query({ keyword: ' [ ', pagesNum: 2, pagesSize: 10 })
      .expect(200)
    expect(response.body).toMatchObject({ data: { list: [{ username: 'a[b' }], total: 21 } })
    const where = { username: { contains: '[' } }
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10 }))
    expect(count).toHaveBeenCalledWith({ where })
  })
  it('旧调用不传关键词仍查全部，非法关键词拒绝', async () => {
    await request(app.getHttpServer()).get('/api/user-get').expect(200)
    expect(count).toHaveBeenCalledWith({ where: {} })
    await request(app.getHttpServer())
      .get('/api/user-get')
      .query({ keyword: 'a'.repeat(192) })
      .expect(400)
  })
})
