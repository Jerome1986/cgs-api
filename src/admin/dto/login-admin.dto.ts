import { IsNotEmpty, IsString, Length } from 'class-validator'

export class LoginAdminDto {
  @IsString({ message: '用户名必须是字符串' })
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string

  @IsString({ message: '密码必须是字符串' })
  @IsNotEmpty({ message: '密码不能为空' })
  @Length(6, 20, { message: '密码长度必须为 6-20 位' })
  password: string
}
