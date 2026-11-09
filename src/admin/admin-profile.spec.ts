import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import type { Admin } from '@prisma/client'
import type { App } from 'supertest/types'
import request from 'supertest'
import * as bcrypt from 'bcrypt'
import { AppModule } from '../app.module'
import { PrismaService } from '../prisma/prisma.service'
import { setupApp } from '../setup-app'

describe('当前管理员资料与密码（真实守卫，隔离数据库）', () => {
  let app: INestApplication<App>
  let jwt: JwtService
  let admin: Admin
  let password: string
  const update = jest.fn((args: Prisma.AdminUpdateArgs) => {
    if (typeof args.data.displayName === 'string') admin.displayName = args.data.displayName
    if (typeof args.data.avatarUrl === 'string') admin.avatarUrl = args.data.avatarUrl
    return Promise.resolve({ ...admin })
  })
  const updateMany = jest.fn((args: Prisma.AdminUpdateManyArgs) => {
    if (args.where?.password !== admin.password || args.where?.tokenVersion !== admin.tokenVersion)
      return Promise.resolve({ count: 0 })
    if (typeof args.data.password === 'string') admin.password = args.data.password
    admin.tokenVersion++
    return Promise.resolve({ count: 1 })
  })
  beforeAll(async () => {
    password = await bcrypt.hash('before123', 4)
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        admin: {
          findUnique: (args: Prisma.AdminFindUniqueArgs) =>
            Promise.resolve(
              args.where.id === admin.id || args.where.username === admin.username
                ? { ...admin }
                : null
            ),
          count: () => Promise.resolve(1),
          update,
          updateMany
        }
      })
      .compile()
    app = module.createNestApplication()
    setupApp(app)
    await app.init()
    jwt = app.get(JwtService)
  })
  beforeEach(() => {
    jest.clearAllMocks()
    admin = {
      id: 1,
      username: 'admin',
      password,
      role: 'ADMIN',
      status: true,
      displayName: '',
      avatarUrl: '',
      tokenVersion: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  })
  afterAll(async () => app.close())
  const token = () => jwt.sign({ sub: 1, role: 'ADMIN', ver: admin.tokenVersion })

  it('资料与头像仅修改当前身份，响应不泄露密码或令牌版本', async () => {
    const auth = token()
    const res = await request(app.getHttpServer())
      .patch('/api/admin/me')
      .set('Authorization', 'Bearer ' + auth)
      .send({ displayName: '  管理员小王  ' })
      .expect(200)
    expect(res.body).toEqual({
      code: 200,
      message: 'success',
      data: {
        id: 1,
        username: 'admin',
        role: 'ADMIN',
        displayName: '管理员小王',
        userAvatarUrl: ''
      }
    })
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 1, status: true, role: 'ADMIN' },
      data: { displayName: '管理员小王' }
    })
    await request(app.getHttpServer())
      .patch('/api/admin/me/avatar')
      .set('Authorization', 'Bearer ' + auth)
      .send({ avatarUrl: 'https://example.com/a.png' })
      .expect(200)
    expect(admin.avatarUrl).toBe('https://example.com/a.png')
    await request(app.getHttpServer())
      .patch('/api/admin/me/avatar')
      .set('Authorization', 'Bearer ' + auth)
      .send({ avatarUrl: '' })
      .expect(200)
    expect(admin.avatarUrl).toBe('')
  })

  it.each([
    { displayName: null },
    { displayName: 'a'.repeat(101) },
    { displayName: '', id: 2 },
    { displayName: '', role: 'ADMIN' }
  ])('资料拒绝非法或越权字段 %j', async (body) => {
    await request(app.getHttpServer())
      .patch('/api/admin/me')
      .set('Authorization', 'Bearer ' + token())
      .send(body)
      .expect(400)
    expect(update).not.toHaveBeenCalled()
  })

  it.each([null, '/a.png', 'javascript:alert(1)', 'https://user:pass@example.com/a.png'])(
    '头像拒绝非法地址 %j',
    async (avatarUrl) => {
      await request(app.getHttpServer())
        .patch('/api/admin/me/avatar')
        .set('Authorization', 'Bearer ' + token())
        .send({ avatarUrl })
        .expect(400)
      expect(update).not.toHaveBeenCalled()
    }
  )

  it('全部写入口拒绝匿名、业务角色及已失去后台权限的身份', async () => {
    for (const [method, path] of [
      ['patch', '/api/admin/me'],
      ['patch', '/api/admin/me/avatar'],
      ['put', '/api/admin/me/password']
    ] as const) {
      await request(app.getHttpServer())[method](path).send({}).expect(401)
      await request(app.getHttpServer())
        [method](path)
        .set('Authorization', 'Bearer ' + jwt.sign({ sub: 1, role: 'user' }))
        .send({})
        .expect(401)
      const auth = token()
      admin.role = 'STAFF'
      await request(app.getHttpServer())
        [method](path)
        .set('Authorization', 'Bearer ' + auth)
        .send({})
        .expect(403)
      admin.role = 'ADMIN'
    }
  })

  it('原密码错误或新旧相同不更新密码，合法更换后新旧令牌和密码行为正确', async () => {
    const oldToken = token()
    const legacyToken = jwt.sign({ sub: 1, role: 'ADMIN' })
    for (const body of [
      { currentPassword: 'wrong123', newPassword: 'after123' },
      { currentPassword: 'before123', newPassword: 'before123' }
    ]) {
      await request(app.getHttpServer())
        .put('/api/admin/me/password')
        .set('Authorization', 'Bearer ' + oldToken)
        .send(body)
        .expect(400)
    }
    expect(updateMany).not.toHaveBeenCalled()
    await request(app.getHttpServer())
      .put('/api/admin/me/password')
      .set('Authorization', 'Bearer ' + oldToken)
      .send({ currentPassword: 'before123', newPassword: 'after123' })
      .expect(200)
    expect(admin.tokenVersion).toBe(1)
    expect(await bcrypt.compare('after123', admin.password)).toBe(true)
    for (const auth of [oldToken, legacyToken]) {
      await request(app.getHttpServer())
        .get('/api/admin/me')
        .set('Authorization', 'Bearer ' + auth)
        .expect(401)
    }
    await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'before123' })
      .expect(401)
    const login = await request(app.getHttpServer())
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'after123' })
      .expect(200)
    const body = login.body as { data: { token: string } }
    await request(app.getHttpServer())
      .get('/api/admin/me')
      .set('Authorization', 'Bearer ' + body.data.token)
      .expect(200)
  })

  it('两个并发改密请求只能一个成功，另一个得到409', async () => {
    const auth = token()
    const responses = await Promise.all(
      ['newOne123', 'newTwo123'].map((newPassword) =>
        request(app.getHttpServer())
          .put('/api/admin/me/password')
          .set('Authorization', 'Bearer ' + auth)
          .send({ currentPassword: 'before123', newPassword })
      )
    )
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409])
    expect(admin.tokenVersion).toBe(1)
  })
})
