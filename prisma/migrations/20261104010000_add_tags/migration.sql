CREATE TABLE `attribute_tags` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '属性标签编号',
  `name` VARCHAR(50) NOT NULL COMMENT '标签名称',
  `en_name` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '英文名称',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` DATETIME(3) NOT NULL COMMENT '更新时间',
  UNIQUE INDEX `attribute_tags_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='素材属性标签字典';
CREATE TABLE `color_tags` (
  `id` INTEGER NOT NULL AUTO_INCREMENT COMMENT '颜色标签编号',
  `color` VARCHAR(9) NOT NULL COMMENT '大写十六进制色值',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` DATETIME(3) NOT NULL COMMENT '更新时间',
  UNIQUE INDEX `color_tags_color_key`(`color`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='素材颜色标签字典';
