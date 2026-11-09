ALTER TABLE admin
  ADD COLUMN display_name VARCHAR(100) NOT NULL DEFAULT '' COMMENT '管理员显示名称，空时展示登录账号',
  ADD COLUMN avatar_url VARCHAR(4096) NOT NULL DEFAULT '' COMMENT '管理员头像HTTP地址，空表示默认头像',
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0 COMMENT '访问令牌版本，修改密码后递增使旧令牌失效';
