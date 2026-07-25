<div align="center">

# fish-ai-code

基于 AI 的智能代码生成与对话助手

<br>

![Java](https://img.shields.io/badge/Java_21-ED8B00?style=for-the-badge&logo=openjdk&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot_3.5-6DB33F?style=for-the-badge&logo=spring-boot&logoColor=white)
![MyBatis-Flex](https://img.shields.io/badge/MyBatis_Flex-525252?style=for-the-badge&logo=mybatis&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL_8-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![LangChain4j](https://img.shields.io/badge/LangChain4j-1C3C3C?style=for-the-badge&logo=chainlink&logoColor=white)
![LangGraph4j](https://img.shields.io/badge/LangGraph4j-FF6F00?style=for-the-badge&logo=graphql&logoColor=white)

![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Ant Design](https://img.shields.io/badge/Ant_Design_6-1677FF?style=for-the-badge&logo=ant-design&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logo=react&logoColor=white)

<br>

[功能](#功能) • [截图](#截图) • [快速开始](#快速开始) • [技术栈](#技术栈)

</div>

---

## 功能

### AI 对话
通过自然语言与 AI 交互，支持流式 SSE 输出和多模型智能路由（DeepSeek / 通义千问）。

### 智能代码生成
AI 自动生成完整代码，支持三种模式：

| 模式 | 说明 |
|------|------|
| **单文件 HTML** | 快速生成独立 HTML 页面 |
| **多文件项目** | 生成包含 HTML/CSS/JS 的多文件结构 |
| **Vue 项目** | 通过 LangGraph4j 工作流编排，自动生成完整 Vue 项目并检查代码质量 |

### 项目下载与部署
生成的代码打包为 ZIP 下载，或一键部署到内置服务器。

### 用户与安全
注册登录、Redis 会话管理、角色权限控制（用户/管理员）、敏感词过滤。

### 性能优化
- Redis 旁路缓存 + Caffeine 本地双层缓存
- Redisson 分布式限流
- AOP 接口限流与权限校验

---

## 项目截图

#### 项目首页
![项目首页](doc/image/1.png)
#### 对话页面
![对话页面](doc/image/3.png)
#### 后台管理
![后台管理](doc/image/2.png)

---

## 快速开始

### 环境准备

- JDK 21+
- Node.js 20+
- MySQL 8+
- Redis

### 配置

```bash
# 1. 创建数据库并初始化
mysql -u root -p < sql/create.sql

# 2. 修改本地配置
#    编辑 src/main/resources/application-local.yaml
#    填入数据库、Redis、AI API Key 等配置
```

### 启动后端

```bash
mvn spring-boot:run
```

### 启动前端

```bash
cd fish-ai-code-frontend
npm install
npm run dev
```

### 访问

| 地址 | 用途 |
|------|------|
| `http://localhost:5173` | 前端页面 |
| `http://localhost:8911/api/doc.html` | API 文档（Knife4j） |

---

## 技术栈

<details open>
<summary><strong>后端</strong></summary>

- **Java 21** + **Spring Boot 3.5** — 核心框架
- **MyBatis-Flex** — ORM
- **MySQL 8** — 持久化存储
- **LangChain4j** — AI 模型统一接入（流式、多模型路由）
- **LangGraph4j** — AI 工作流编排
- **Redis** — 会话管理、旁路缓存
- **Redisson + Caffeine** — 分布式限流 + 本地缓存
- **Knife4j** — 接口文档
</details>

<details>
<summary><strong>前端</strong></summary>

- **React 19** + **TypeScript** + **Vite**
- **Ant Design 6** — UI 组件库
- **Zustand** — 状态管理
- **React Router 8** — 路由管理
- **React Markdown** + **React Syntax Highlighter** — 代码渲染与高亮
</details>

<details>
<summary><strong>AI 模型</strong></summary>

- **DeepSeek** — 默认对话与推理模型
- **阿里云百炼（通义千问）** — 智能路由分类任务
</details>

---

<div align="center">
  <sub>Built by hui fei de yu</sub>
</div>
