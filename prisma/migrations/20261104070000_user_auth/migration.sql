ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(60) NULL COMMENT '客户端登录密码bcrypt哈希，旧账号为空且不可密码登录';
