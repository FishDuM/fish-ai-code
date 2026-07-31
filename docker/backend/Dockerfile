# 后端镜像：多阶段构建（maven 编译 → JRE 运行）
# 构建：docker build -t fish-ai-code-backend -f docker/backend/Dockerfile .
# 运行配置全部走环境变量（见 docker-compose.yml / application-docker.yaml）

# ── 阶段 1：编译 ──
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
# 先复制 pom 单独拉依赖，利用 Docker 层缓存（pom 不变则依赖层不重建）
COPY pom.xml .
RUN mvn -B dependency:go-offline -q || true
# 复制源码并打包
COPY src ./src
RUN mvn -B clean package -DskipTests -q

# ── 阶段 2：运行 ──
FROM eclipse-temurin:21-jre
WORKDIR /app
# 时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 复制构建产物
COPY --from=builder /build/target/*.jar app.jar

# 需要访问宿主 Docker 来运行 Vue 隔离构建容器（docker.sock 由 compose 挂载）
# 安装 docker CLI 供 VueProjectBuilder 调用 docker run
RUN apt-get update && apt-get install -y --no-install-recommends docker.io curl \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8911
# 生产 profile：配置从环境变量读取（spring.profiles.active=docker）
ENV SPRING_PROFILES_ACTIVE=docker
ENTRYPOINT ["java", "-jar", "app.jar"]
