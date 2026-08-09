# 前端镜像：node 构建 → nginx 托管
# 构建：docker build -t fish-ai-code-frontend -f docker/frontend/Dockerfile .

# ── 阶段 1：构建 ──
FROM node:20-alpine AS builder
WORKDIR /build
COPY fish-ai-code-frontend/package*.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY fish-ai-code-frontend/ ./
RUN npm run build

# ── 阶段 2：运行（nginx）──
FROM nginx:1.27-alpine
# 前端产物 + nginx 配置模板（含 /api 反代到后端、部署路径占位符）
COPY --from=builder /build/dist /usr/share/nginx/html
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf.tpl
# 启动时按 APP_DEPLOY_PATH 生成实际配置（与后端 app.deploy.path 保持一致）
COPY docker/frontend/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
