import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'

export function setupApp(app: INestApplication) {
  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  )
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.enableCors()
}
