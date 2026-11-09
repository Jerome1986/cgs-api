import { IsNotEmpty, IsString, Length } from 'class-validator'

/** 后台管理员账号密码登录参数 */
export class LoginAdminDto {
  /** 管理员用户名，必填 */
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string

  /** 登录密码，长度为 6～20 个字符，由服务端与 bcrypt 哈希比对 */
  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @Length(6, 20, { message: '密码长度必须为 6-20 位' })
  password: string
}
