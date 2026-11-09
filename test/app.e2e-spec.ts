import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { setupApp } from '../src/setup-app'
import * as bcrypt from 'bcrypt'
import { JwtService } from '@nestjs/jwt'

describe('App (e2e)', () => {
  let app: INestApplication<App>
  const admin = {
    id: 1,
    username: 'admin',
    password: '',
    role: 'ADMIN',
    status: true
  }
  const findUnique = jest.fn(({ where }: { where: { username?: string; id?: number } }) =>
    Promise.resolve(where.username === admin.username || where.id === admin.id ? admin : null)
  )
  const user = {
    id: 7,
    username: 'customer',
    role: 'user',
    coins: 10,
    status: 1,
    endDate: null,
    createdAt: new Date('2026-11-04T00:00:00Z')
  }
  const findMany = jest.fn().mockResolvedValue([user])
  const countUsers = jest.fn().mockResolvedValue(1)

  beforeAll(async () => {
    process.env.DATABASE_URL = 'mysql://root:password@localhost:3306/test'
    process.env.JWT_SECRET = 'test-secret'
    admin.password = await bcrypt.hash('test123456', 4)

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: jest.fn(),
        $disconnect: jest.fn(),
        admin: { findUnique, count: jest.fn().mockResolvedValue(1) },
        user: { findMany, count: countUsers },
        $transaction: (queries: Promise<unknown>[]) => Promise.all(queries)
      })
      .compile()

    app = moduleRef.createNestApplication()
    setupApp(app)
    await app.init()
  })

  afterAll(async () => app.close())

  beforeEach(() => {
    jest.clearAllMocks()
    admin.role = 'ADMIN'
    admin.status = true
  })

  it('登录后首页查询业务用户分页和搜索列表，使用整数id与camelCase字段', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'test123456' })
      .expect(200)
    const { data } = login.body as { data: { token: string } }
    const page = await request(app.getHttpServer())
      .get('/api/user-get?pagesNum=2&pagesSize=5')
      .set('Authorization', `Bearer ${data.token}`)
      .expect(200)
    expect((page.body as { data: unknown }).data).toEqual({
      list: [{ ...user, createdAt: user.createdAt.toISOString() }],
      total: 1
    })
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5 }))
    const all = await request(app.getHttpServer())
      .get('/api/user-search-get')
      .set('Authorization', `Bearer ${data.token}`)
      .expect(200)
    expect((all.body as { data: unknown }).data).toEqual([
      { ...user, createdAt: user.createdAt.toISOString() }
    ])
    for (const query of ['pagesNum=0', 'pagesSize=101', 'pagesNum=abc']) {
      await request(app.getHttpServer())
        .get(`/api/user-get?${query}`)
        .set('Authorization', `Bearer ${data.token}`)
        .expect(400)
    }
  })

  it.each(['/api/user-get', '/api/user-search-get'])(
    '用户查询必须通过服务端管理员校验 %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(401)
      expect(findMany).not.toHaveBeenCalled()
      const token = new JwtService({ secret: 'test-secret' }).sign({ sub: 1, role: 'ADMIN' })
      admin.role = 'STAFF'
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .expect(403)
      expect(findMany).not.toHaveBeenCalled()
    }
  )

  it('登录返回令牌和安全用户信息，令牌可用于查询当前管理员', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'test123456' })
      .expect(200)
    const body = login.body as { data: { token: string; userInfo: unknown } }
    expect(body.data.userInfo).toEqual({
      id: 1,
      username: 'admin',
      role: 'ADMIN',
      displayName: '',
      userAvatarUrl: ''
    })
    const token = body.data.token
    await request(app.getHttpServer())
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    admin.status = false
    await request(app.getHttpServer())
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
  })

  it.each([
    ['unknown', 'test123456'],
    ['admin', 'wrong123']
  ])('拒绝无效凭据 %s', async (username, password) => {
    await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ username, password })
      .expect(401)
  })

  it('拒绝禁用账号、非管理员账号和多余输入字段', async () => {
    admin.status = false
    await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'test123456' })
      .expect(401)
    admin.status = true
    admin.role = 'STAFF'
    await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'test123456' })
      .expect(403)
    await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'test123456', role: 'ADMIN' })
      .expect(400)
  })

  it('拒绝缺失、伪造和过期的令牌', async () => {
    await request(app.getHttpServer()).get('/api/admin/me').expect(401)
    await request(app.getHttpServer())
      .get('/api/admin/me')
      .set('Authorization', 'Bearer invalid')
      .expect(401)
    const token = new JwtService({ secret: 'test-secret' }).sign(
      { sub: 1, role: 'ADMIN' },
      { expiresIn: -1 }
    )
    await request(app.getHttpServer())
      .get('/api/admin/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
  })

  it('GET /api', async () => {
    await request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect({
        code: 200,
        message: 'success',
        data: { name: 'nest-model', status: 'ok' }
      })
  })
})
