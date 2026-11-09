import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ArrayMaxSize
} from 'class-validator'
import { Type } from 'class-transformer'
import { QueryMaterialDto } from '../../material/dto/material.dto'

/** 旧用户编号仅用于兼容校验，服务端身份来自令牌 */
export class UserMaterialQueryDto {
  /** 可省略，不能指向其他用户 */
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,9}$/) user_id?: string
}
export class UserMaterialDto extends UserMaterialQueryDto {
  /** 当前操作的素材编号 */
  @IsString() @Matches(/^[1-9]\d{0,9}$/) material_id: string
  /** 明确目标收藏状态，旧调用不传时表示收藏，不采用反复切换语义 */
  @IsOptional() @IsBoolean() collected?: boolean
}
export class DownloadFileQueryDto extends UserMaterialDto {
  /** 文件序号，必须对应服务端素材文件数组 */
  @Type(() => Number) @IsInt() @Min(0) @Max(99) index = 0
}
export class UserMaterialFilterDto extends QueryMaterialDto {
  /** 是否限制当前用户收藏 */
  @IsOptional() @IsBoolean() onlyFavorites = false
  /** 客户端已核验存在的本机素材编号，最多5万项；省略不限制，空数组无结果 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50000, { message: '本机素材筛选最多支持50000个编号' })
  @IsString({ each: true })
  @Matches(/^[1-9]\d{0,9}$/, { each: true })
  localIds?: string[]
}
