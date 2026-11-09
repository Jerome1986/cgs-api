import { Controller, Get } from '@nestjs/common'

@Controller()
export class AppController {
  /** 返回应用名称及运行状态，不检查数据库等外部依赖的可用性 */
  @Get()
  health() {
    return { name: 'nest-model', status: 'ok' }
  }
}
