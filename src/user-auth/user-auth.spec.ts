import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import type { App } from 'supertest/types'
import request from 'supertest'
import * as bcrypt from 'bcrypt'
import { UserAuthController } from './user-auth.controller'
import { UserAuthService } from './user-auth.service'
import { UserAuthRepository } from './user-auth.repository'
import { UserAuthGuard } from './user-auth.guard'
import { setupApp } from '../setup-app'

describe('Electron用户认证HTTP契约（真实JWT和密码哈希，隔离数据库）', () => {
  let app: INestApplication<App>
  let jwt: JwtService
  let passwordHash: string
  const row = () => ({
    id: 8,
    username: 'member01',
    passwordHash,
    role: 'user',
    status: 1,
    coins: 0,
    endDate: null,
    createdAt: new Date('2026-11-04T00:00:00Z')
  })
  const repo = {
    create: jest.fn(),
    findByUsername: jest.fn(),
    findById: jest.fn()
  }
  const credentials = { username: 'member01', password: 'secret123' }

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(credentials.password, 4)
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'isolated-user-auth-test',
          signOptions: { expiresIn: '1h' }
        })
      ],
      controllers: [UserAuthController],
      providers: [UserAuthService, UserAuthGuard, { provide: UserAuthRepository, useValue: repo }]
    }).compile()
    jwt = module.get(JwtService)
    app = module.createNestApplication()
    setupApp(app)
    await app.init()
  })
  afterAll(async () => app.close())
  beforeEach(() => {
    jest.resetAllMocks()
    repo.create.mockResolvedValue(row())
    repo.findByUsername.mockResolvedValue(row())
    repo.findById.mockResolvedValue(row())
  })

  it.each(['', '/api'])(
    '保留%s入口，注册哈希密码且仅返回账号；登录及资料响应不泄漏哈希',
    async (prefix) => {
      const registered = await request(app.getHttpServer())
        .post(prefix + '/user-register')
        .send(credentials)
        .expect(200)
      expect(registered.body).toEqual({
        code: 200,
        message: 'success',
        data: { _id: '8', username: 'member01' }
      })
      const hash = repo.create.mock.calls[0][1] as string
      expect(hash).not.toBe(credentials.password)
      expect(await bcrypt.compare(credentials.password, hash)).toBe(true)
      const loggedIn = await request(app.getHttpServer())
        .post(prefix + '/user-login')
        .send(credentials)
        .expect(200)
      expect(loggedIn.body.data).toMatchObject({
        _id: '8',
        role: 'user',
        coins: 0
      })
      expect(loggedIn.body.data).not.toHaveProperty('passwordHash')
      expect(jwt.verify(loggedIn.body.data.token)).toMatchObject({
        sub: 8,
        role: 'USER'
      })
      for (const auth of [loggedIn.body.data.token, `Bearer ${loggedIn.body.data.token}`]) {
        const me = await request(app.getHttpServer())
          .get(prefix + '/user-web-get?user_id=8')
          .set('Authorization', auth)
          .expect(200)
        expect(me.body.data).toMatchObject({ _id: '8', coins: 0 })
        expect(me.body.data).not.toHaveProperty('passwordHash')
        expect(me.body.data).not.toHaveProperty('token')
      }
    }
  )

  it('并发重名由唯一约束转409，不覆盖旧账号', async () => {
    repo.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7'
      })
    )
    await request(app.getHttpServer()).post('/user-register').send(credentials).expect(409)
  })

  it.each([
    { username: 'short', password: 'secret123' },
    { username: 'member01', password: 'short' },
    { username: 'member 1', password: 'secret123' },
    { username: 'member01', password: '中'.repeat(25) },
    { ...credentials, role: 'ADMIN' },
    { ...credentials, coins: 999 },
    { ...credentials, password: 'secret\0pass' }
  ])('拒绝不合法凭据和越权注册字段 %#', async (body) => {
    await request(app.getHttpServer()).post('/user-register').send(body).expect(400)
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('未知用户、错误密码、禁用或无密码旧用户均不能登录', async () => {
    for (const account of [null, { ...row(), status: 0 }, { ...row(), passwordHash: null }]) {
      repo.findByUsername.mockResolvedValue(account)
      await request(app.getHttpServer()).post('/user-login').send(credentials).expect(401)
    }
    repo.findByUsername.mockResolvedValue(row())
    await request(app.getHttpServer())
      .post('/user-login')
      .send({ ...credentials, password: 'wrong123' })
      .expect(401)
  })

  it('拒绝缺失、伪造、过期、管理员及错误身份令牌', async () => {
    const tokens = [
      'invalid',
      jwt.sign({ sub: 8, role: 'USER' }, { expiresIn: -1 }),
      jwt.sign({ sub: 8, role: 'ADMIN' }),
      jwt.sign({ sub: '8', role: 'USER' })
    ]
    await request(app.getHttpServer()).get('/user-web-get').expect(401)
    for (const token of tokens)
      await request(app.getHttpServer())
        .get('/user-web-get')
        .set('Authorization', token)
        .expect(401)
    expect(repo.findById).not.toHaveBeenCalled()
  })

  it('当前资料来自令牌，越权user_id返回403；余额刷新，禁用和删除立即生效', async () => {
    const token = jwt.sign({ sub: 8, role: 'USER' })
    await request(app.getHttpServer())
      .get('/user-web-get?user_id=9')
      .set('Authorization', token)
      .expect(403)
    repo.findById.mockResolvedValue({ ...row(), coins: 66 })
    const me = await request(app.getHttpServer())
      .get('/user-web-get')
      .set('Authorization', token)
      .expect(200)
    expect(me.body.data.coins).toBe(66)
    expect(repo.findById).toHaveBeenLastCalledWith(8)
    for (const account of [null, { ...row(), status: 0 }]) {
      repo.findById.mockResolvedValue(account)
      await request(app.getHttpServer())
        .get('/user-web-get')
        .set('Authorization', token)
        .expect(401)
    }
  })
})
