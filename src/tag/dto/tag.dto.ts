import { Transform, Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator'

/** 标签分页查询，未传分页时返回完整字典供选择器复用 */
export class QueryTagDto {
  /** 当前页码 */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  pagesNum = 1

  /** 每页条数，默认完整字典；显式分页最多100条 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pagesSize?: number
}

/** 标签资源编号 */
export class TagIdDto {
  /** 兼容旧客户端的字符串编号 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  _id: string
}

/** 属性标签写入白名单 */
export class AttributeTagDto {
  /** 中文名称 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 50)
  name: string

  /** 英文名称，省略时为空字符串 */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 100)
  en_name = ''
}

/** 属性标签修改 */
export class UpdateAttributeTagDto extends AttributeTagDto {
  /** 字符串编号 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  _id: string
}

/** 颜色标签写入 */
export class ColorTagDto {
  /** 十六进制颜色，支持三、四、六、八位 */
  @IsString()
  @Matches(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i)
  color: string
}

/** 颜色标签修改 */
export class UpdateColorTagDto extends ColorTagDto {
  /** 字符串编号 */
  @IsString()
  @Matches(/^[1-9]\d{0,9}$/)
  _id: string
}
