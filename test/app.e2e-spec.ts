import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { App } from 'supertest/types'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'
import { setupApp } from '../src/setup-app'

describe('App (e2e)', () => {
  let app: INestApplication<App>

  beforeAll(async () => {
    process.env.DATABASE_URL = 'mysql://root:password@localhost:3306/test'
    process.env.JWT_SECRET = 'test-secret'

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
      .compile()

    app = moduleRef.createNestApplication()
    setupApp(app)
    await app.init()
  })

  afterAll(async () => app.close())

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
