ALTER TABLE users ADD COLUMN daily_download_limit INTEGER NOT NULL DEFAULT 0 COMMENT '会员每日首次素材授权额度，0表示未配置';
CREATE TABLE user_favorites (
  id INTEGER NOT NULL AUTO_INCREMENT COMMENT '收藏编号',
  user_id INTEGER NOT NULL COMMENT '所属用户编号',
  material_id INTEGER NOT NULL COMMENT '收藏素材编号',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '收藏时间',
  PRIMARY KEY (id), UNIQUE KEY user_favorites_user_id_material_id_key (user_id, material_id),
  CONSTRAINT user_favorites_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT user_favorites_material_fk FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '用户收藏表';
CREATE TABLE download_grants (
  id INTEGER NOT NULL AUTO_INCREMENT COMMENT '授权编号',
  user_id INTEGER NOT NULL COMMENT '所属用户编号',
  material_id INTEGER NOT NULL COMMENT '授权素材编号',
  kind VARCHAR(16) NOT NULL COMMENT '授权来源coins或membership',
  charged_coins INTEGER NOT NULL DEFAULT 0 COMMENT '首次授权实际扣除金币',
  daily_key VARCHAR(10) NULL COMMENT '会员额度所属上海日期',
  completed_at DATETIME(3) NULL COMMENT '客户端首次确认下载完成时间',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '首次授权时间',
  PRIMARY KEY (id), UNIQUE KEY download_grants_user_id_material_id_key (user_id, material_id),
  KEY download_grants_user_id_completed_at_idx (user_id, completed_at),
  CONSTRAINT download_grants_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT download_grants_material_fk FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '素材下载授权与扣费记录';
CREATE TABLE download_usage (
  id INTEGER NOT NULL AUTO_INCREMENT COMMENT '每日用量编号',
  user_id INTEGER NOT NULL COMMENT '所属用户编号',
  day_key VARCHAR(10) NOT NULL COMMENT '上海业务日期',
  used INTEGER NOT NULL DEFAULT 0 COMMENT '已使用首次授权次数',
  PRIMARY KEY (id), UNIQUE KEY download_usage_user_id_day_key_key (user_id, day_key),
  CONSTRAINT download_usage_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '会员每日下载授权用量';
