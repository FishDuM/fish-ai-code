FROM node:20-alpine

# 此阶段只在管理员构建镜像时联网。运行时直接复制预装 node_modules，完全不执行 npm 安装。
USER root
WORKDIR /opt/offline-seed
COPY package.json ./package.json
RUN npm install --registry=https://registry.npmmirror.com --ignore-scripts --audit=false --fund=false --cache /opt/npm-cache \
    && chown -R node:node /opt/offline-seed/node_modules \
    && chmod -R a+rX /opt/offline-seed/node_modules

USER node
WORKDIR /workspace
