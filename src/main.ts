import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { setupApp } from './setup-app'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  setupApp(app)

  const port = Number(process.env.PORT ?? 3000)
  await app.listen(port)
  Logger.log(`Application running at ${await app.getUrl()}`, 'Bootstrap')
}

void bootstrap()
