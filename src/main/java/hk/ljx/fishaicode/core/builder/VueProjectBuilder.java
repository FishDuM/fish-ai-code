package hk.ljx.fishaicode.core.builder;

import hk.ljx.fishaicode.constant.AppConstant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.PosixFilePermission;
import java.time.Duration;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.TimeUnit;

/**
 * 在受限 Docker 容器中构建 AI 生成的 Vue 项目。
 *
 * <p>AI 可控制 package.json 及 build 脚本，因此绝不能在宿主机直接执行 npm。</p>
 */
@Slf4j
@Component
public class VueProjectBuilder {

    private static final String PROJECT_DIR_PREFIX = "vue_project_";
    private static final int MAX_BUILD_LOG_CHARS = 20_000;
    private static final int PROJECT_READY_MAX_ATTEMPTS = 5;

    private final VueBuildProperties properties;

    public VueProjectBuilder(VueBuildProperties properties) {
        this.properties = properties;
    }

    /**
     * 等待 AI 工具将项目文件落盘后构建，返回结果供调用方决定是否结束生成 SSE。
     */
    public boolean buildProjectWhenReady(String projectPath) {
        try {
            for (int attempt = 1; attempt <= PROJECT_READY_MAX_ATTEMPTS; attempt++) {
                if (isProjectReady(projectPath)) {
                    return buildProject(projectPath);
                }
                if (attempt < PROJECT_READY_MAX_ATTEMPTS) {
                    log.info("等待 Vue 项目文件落盘（第 {}/{} 次）", attempt, PROJECT_READY_MAX_ATTEMPTS);
                    Thread.sleep(1000);
                }
            }
            log.error("Vue 项目文件未在 {} 秒内生成，跳过构建", PROJECT_READY_MAX_ATTEMPTS - 1);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("等待 Vue 项目文件时被中断", e);
        } catch (Exception e) {
            log.error("构建 Vue 项目时发生异常", e);
        }
        return false;
    }

    private boolean isProjectReady(String projectPath) {
        try {
            Path projectDir = Path.of(projectPath).toAbsolutePath().normalize();
            return Files.isDirectory(projectDir, LinkOption.NOFOLLOW_LINKS)
                    && Files.isRegularFile(projectDir.resolve("package.json"), LinkOption.NOFOLLOW_LINKS);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 在临时的 Docker 容器中构建 Vue 项目，并仅将校验后的 dist 目录发布回项目目录。
     */
    public boolean buildProject(String projectPath) {
        Path sourceDir;
        try {
            sourceDir = validateProjectDirectory(projectPath);
        } catch (IOException | IllegalArgumentException e) {
            log.error("Vue 项目路径不合法: {}", e.getMessage());
            return false;
        }

        Path buildDir = null;
        try {
            buildDir = Files.createTempDirectory(getOutputRoot(), "vue-build-");
            Path workspaceDir = buildDir.resolve("workspace");
            Path outputDir = buildDir.resolve("dist");
            createContainerWritableDirectory(workspaceDir);
            createContainerWritableDirectory(outputDir);

            log.info("开始在受限 Docker 容器中构建 Vue 项目: {}", sourceDir.getFileName());
            if (!executeDockerBuild(sourceDir, workspaceDir, outputDir)) {
                return false;
            }
            validateBuildOutput(outputDir);
            publishBuildOutput(sourceDir, outputDir);
            log.info("Vue 项目构建成功: {}", sourceDir.getFileName());
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("Vue 项目构建被中断", e);
            return false;
        } catch (IOException e) {
            log.error("Vue 项目构建失败: {}", e.getMessage());
            return false;
        } finally {
            if (buildDir != null) {
                try {
                    deleteRecursively(buildDir);
                } catch (IOException e) {
                    log.warn("清理 Vue 构建临时目录失败: {}", e.getMessage());
                }
            }
        }
    }

    private Path validateProjectDirectory(String projectPath) throws IOException {
        if (projectPath == null || projectPath.isBlank()) {
            throw new IllegalArgumentException("项目路径不能为空");
        }
        Path outputRoot = getOutputRoot();
        Path candidate = Path.of(projectPath).toAbsolutePath().normalize();
        if (!candidate.startsWith(outputRoot)
                || !candidate.getFileName().toString().matches(PROJECT_DIR_PREFIX + "[1-9]\\d*")) {
            throw new IllegalArgumentException("项目目录不在允许的生成目录中");
        }
        if (!Files.isDirectory(candidate, LinkOption.NOFOLLOW_LINKS)
                || !Files.isRegularFile(candidate.resolve("package.json"), LinkOption.NOFOLLOW_LINKS)) {
            throw new IllegalArgumentException("项目目录或 package.json 不存在");
        }
        Path realRoot = outputRoot.toRealPath();
        Path realProject = candidate.toRealPath();
        if (!realProject.startsWith(realRoot)) {
            throw new IllegalArgumentException("项目目录不能通过符号链接离开生成目录");
        }
        return realProject;
    }

    private boolean executeDockerBuild(Path sourceDir, Path workspaceDir, Path outputDir) throws IOException, InterruptedException {
        ProcessBuilder processBuilder = new ProcessBuilder(createDockerCommand(sourceDir, workspaceDir, outputDir));
        processBuilder.redirectErrorStream(true);
        Process process;
        try {
            process = processBuilder.start();
        } catch (IOException e) {
            log.error("无法启动 Docker 构建容器，请确认 Docker Desktop 正在运行且当前账号有 Docker 权限: {}", e.getMessage());
            return false;
        }

        StringBuilder buildLog = new StringBuilder();
        Thread logReader = Thread.ofVirtual().start(() -> readBuildLog(process, buildLog));
        AtomicBoolean workspaceLimitExceeded = new AtomicBoolean(false);
        Thread workspaceMonitor = Thread.ofVirtual().start(
                () -> monitorWorkspaceSize(process, workspaceDir, workspaceLimitExceeded));
        boolean finished = process.waitFor(properties.getTimeoutSeconds(), TimeUnit.SECONDS);
        workspaceMonitor.interrupt();
        workspaceMonitor.join(Duration.ofSeconds(2));
        if (!finished) {
            process.destroyForcibly();
            log.error("Vue Docker 构建超时（{} 秒）", properties.getTimeoutSeconds());
            logBuildOutput(buildLog);
            return false;
        }
        logReader.join(Duration.ofSeconds(5));
        if (workspaceLimitExceeded.get()) {
            log.error("Vue Docker 构建工作目录超过 {} MB 限制", properties.getMaxWorkspaceMb());
            logBuildOutput(buildLog);
            return false;
        }
        if (process.exitValue() != 0) {
            log.error("Vue Docker 构建失败，退出码: {}", process.exitValue());
            logBuildOutput(buildLog);
            return false;
        }
        return true;
    }

    private void readBuildLog(Process process, StringBuilder buildLog) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                synchronized (buildLog) {
                    if (buildLog.length() < MAX_BUILD_LOG_CHARS) {
                        buildLog.append(line).append(System.lineSeparator());
                    }
                }
            }
        } catch (IOException e) {
            log.debug("读取 Vue 构建日志失败: {}", e.getMessage());
        }
    }

    private void logBuildOutput(StringBuilder buildLog) {
        synchronized (buildLog) {
            if (!buildLog.isEmpty()) {
                log.warn("Vue Docker 构建日志（已截断）:{}{}", System.lineSeparator(), buildLog);
            }
        }
    }

    /**
     * 构建命令独立出来，以便测试安全限制不会被后续修改移除。
     */
    List<String> createDockerCommand(Path sourceDir, Path workspaceDir, Path outputDir) {
        String containerRoot = getOutputRoot().toString();
        String hostRoot = properties.getHostCodeOutputDir();
        List<String> command = new ArrayList<>(List.of(
                "docker", "run", "--rm",
                "--network", "none",
                "--read-only",
                "--user", "node",
                "--workdir", "/workspace",
                "--cpus", String.valueOf(properties.getCpuLimit()),
                "--memory", properties.getMemoryMb() + "m",
                "--pids-limit", String.valueOf(properties.getPidsLimit()),
                "--cap-drop", "ALL",
                "--security-opt", "no-new-privileges",
                "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=700",
                "--mount", "type=bind,src=" + toHostMountSource(containerRoot, hostRoot, sourceDir) + ",dst=/input,readonly,bind-propagation=rprivate",
                "--mount", "type=bind,src=" + toHostMountSource(containerRoot, hostRoot, workspaceDir) + ",dst=/workspace,bind-propagation=rprivate",
                "--mount", "type=bind,src=" + toHostMountSource(containerRoot, hostRoot, outputDir) + ",dst=/output,bind-propagation=rprivate",
                "--env", "npm_config_update_notifier=false",
                properties.getDockerImage(),
                "sh", "-ec",
                // node_modules 软链到镜像内 seed，避免 cp -a 逐文件复制（~31s）；删除目录须 NOFOLLOW（见 deleteRecursively）
                "cp -a /input/. /workspace/ && "
                        + "ln -s /opt/offline-seed/node_modules /workspace/node_modules && "
                        + "npm run build && test -d dist && cp -a dist/. /output/"
        ));
        return command;
    }

    /**
     * 把容器内路径映射为宿主机 daemon 可解析的 bind 源路径。
     * docker.sock 模式下 --mount 的 src 由宿主机 daemon 解析，compose 部署时
     * 容器内根（/app/tmp/code_output）在宿主机上不存在，需替换为宿主机根；未配置则原样返回。
     */
    static String toHostMountSource(String containerRoot, String hostRoot, Path containerPath) {
        if (containerRoot == null || containerRoot.isBlank()
                || hostRoot == null || hostRoot.isBlank()) {
            return containerPath.toString();
        }
        Path containerRootPath = Path.of(containerRoot);
        if (containerPath.startsWith(containerRootPath)) {
            Path relative = containerRootPath.relativize(containerPath);
            return Path.of(hostRoot).resolve(relative).normalize().toString();
        }
        return containerPath.toString();
    }

    private void monitorWorkspaceSize(Process process, Path workspaceDir, AtomicBoolean limitExceeded) {
        while (process.isAlive() && !Thread.currentThread().isInterrupted()) {
            try {
                if (getDirectorySize(workspaceDir) > properties.getMaxWorkspaceMb() * 1024L * 1024L) {
                    limitExceeded.set(true);
                    process.destroyForcibly();
                    return;
                }
                Thread.sleep(500);
            } catch (IOException e) {
                log.warn("统计 Vue 构建工作目录大小失败: {}", e.getMessage());
                return;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private long getDirectorySize(Path root) throws IOException {
        BuildOutputStats stats = new BuildOutputStats();
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) {
                if (attrs.isRegularFile()) {
                    stats.size += attrs.size();
                }
                return FileVisitResult.CONTINUE;
            }
        });
        return stats.size;
    }

    private void validateBuildOutput(Path outputDir) throws IOException {
        BuildOutputStats stats = new BuildOutputStats();
        Files.walkFileTree(outputDir, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                if (Files.isSymbolicLink(file) || !attrs.isRegularFile()) {
                    throw new IOException("构建产物包含不允许的特殊文件");
                }
                stats.fileCount++;
                stats.size += attrs.size();
                if (stats.fileCount > properties.getMaxOutputFiles()
                        || stats.size > properties.getMaxOutputMb() * 1024L * 1024L) {
                    throw new IOException("构建产物超过大小或文件数量限制");
                }
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult preVisitDirectory(Path dir, BasicFileAttributes attrs) throws IOException {
                if (Files.isSymbolicLink(dir) || !attrs.isDirectory()) {
                    throw new IOException("构建产物包含不允许的目录");
                }
                return FileVisitResult.CONTINUE;
            }
        });
        if (stats.fileCount == 0) {
            throw new IOException("构建产物为空");
        }
    }

    private void publishBuildOutput(Path sourceDir, Path outputDir) throws IOException {
        Path distDir = sourceDir.resolve("dist");
        Path backupDir = sourceDir.resolve(".dist-backup-" + System.nanoTime());
        if (Files.exists(distDir, LinkOption.NOFOLLOW_LINKS)) {
            Files.move(distDir, backupDir);
        }
        try {
            Files.move(outputDir, distDir);
            if (Files.exists(backupDir, LinkOption.NOFOLLOW_LINKS)) {
                deleteRecursively(backupDir);
            }
        } catch (IOException e) {
            if (!Files.exists(distDir, LinkOption.NOFOLLOW_LINKS)
                    && Files.exists(backupDir, LinkOption.NOFOLLOW_LINKS)) {
                Files.move(backupDir, distDir);
            }
            throw e;
        }
    }

    private Path getOutputRoot() {
        return Path.of(AppConstant.CODE_OUTPUT_ROOT_DIR).toAbsolutePath().normalize();
    }

    private void createContainerWritableDirectory(Path directory) throws IOException {
        Files.createDirectory(directory);
        try {
            Set<PosixFilePermission> permissions = EnumSet.allOf(PosixFilePermission.class);
            Files.setPosixFilePermissions(directory, permissions);
        } catch (UnsupportedOperationException e) {
            log.debug("当前文件系统不支持 POSIX 权限设置: {}", directory);
        }
    }

    private void deleteRecursively(Path root) throws IOException {
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) {
            return;
        }
        Files.walkFileTree(root, new SimpleFileVisitor<>() {
            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                Files.delete(file);
                return FileVisitResult.CONTINUE;
            }

            @Override
            public FileVisitResult postVisitDirectory(Path dir, IOException exc) throws IOException {
                if (exc != null) {
                    throw exc;
                }
                Files.delete(dir);
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static class BuildOutputStats {
        private long size;
        private int fileCount;
    }
}
