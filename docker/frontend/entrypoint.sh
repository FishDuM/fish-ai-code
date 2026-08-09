#!/bin/sh
# 启动时根据 APP_DEPLOY_PATH 生成 nginx 配置（默认 /deploy）。
# 与后端 app.deploy.path 使用同一环境变量，保证部署地址一致。
set -e

DEPLOY_PATH="${APP_DEPLOY_PATH:-/deploy}"
# 剔除 Windows .env 常见的 CRLF 行尾（\r）
DEPLOY_PATH="$(printf '%s' "$DEPLOY_PATH" | tr -d '\r')"

# 部署路径契约（与后端 AppDeployProperties.isValidPath 同一套规则）：
# 必须以 / 开头，一个或多个路径段，每段仅允许字母数字 _ -；
# 禁止空段（//）、禁止 . / ..、禁止 query（?）与 fragment（#）。
# 非法配置直接退出，避免配置能启动但部署地址打不开。
case "$DEPLOY_PATH" in
  /*) ;;
  *) echo "APP_DEPLOY_PATH 必须以 / 开头: $DEPLOY_PATH" >&2; exit 1 ;;
esac
# 规范化：去首尾斜杠，统一为无尾斜杠形式（如 /deploy）
DEPLOY_PATH="/$(printf '%s' "$DEPLOY_PATH" | sed 's#^/*##; s#/*$##')"
if ! printf '%s' "$DEPLOY_PATH" | grep -Eq '^/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$'; then
  echo "APP_DEPLOY_PATH 不合法: $DEPLOY_PATH。必须以 / 开头，每个路径段仅含字母数字 _ -，不允许空段、.、..、?、# 或连续 //" >&2
  exit 1
fi

# 替换占位符生成实际配置
sed "s#__DEPLOY_PATH__#${DEPLOY_PATH}#g" /etc/nginx/conf.d/default.conf.tpl > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
