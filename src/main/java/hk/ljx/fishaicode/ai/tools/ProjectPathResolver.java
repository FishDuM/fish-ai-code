package hk.ljx.fishaicode.ai.tools;

import cn.hutool.core.util.StrUtil;
import hk.ljx.fishaicode.constant.AppConstant;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 将 AI 工具传入的相对路径安全地限制在当前 Vue 项目目录内。
 */
@Component
public class ProjectPathResolver {

    public Path resolveExistingFile(Long appId, String relativePath) throws IOException {
        Path projectRoot = getProjectRoot(appId);
        Path targetPath = resolveRelativePath(projectRoot, relativePath);
        if (!Files.isRegularFile(targetPath)) {
            throw new IOException("文件不存在或不是普通文件");
        }
        return verifyExistingPath(projectRoot, targetPath);
    }

    public Path resolveExistingDirectory(Long appId, String relativePath) throws IOException {
        Path projectRoot = getProjectRoot(appId);
        Path targetPath = resolveRelativePath(projectRoot, relativePath);
        if (!Files.isDirectory(targetPath)) {
            throw new IOException("目录不存在或不是目录");
        }
        return verifyExistingPath(projectRoot, targetPath);
    }

    public Path resolveWritableFile(Long appId, String relativePath) throws IOException {
        Path projectRoot = getProjectRoot(appId);
        Files.createDirectories(projectRoot);
        Path targetPath = resolveRelativePath(projectRoot, relativePath);
        Path parentPath = targetPath.getParent();
        if (parentPath == null) {
            throw new IllegalArgumentException("文件路径不合法");
        }

        Files.createDirectories(parentPath);
        Path realProjectRoot = projectRoot.toRealPath();
        Path realParentPath = parentPath.toRealPath();
        if (!realParentPath.startsWith(realProjectRoot)) {
            throw new IllegalArgumentException("文件路径超出项目目录");
        }
        if (Files.exists(targetPath)) {
            if (!Files.isRegularFile(targetPath)) {
                throw new IOException("目标不是普通文件");
            }
            verifyExistingPath(projectRoot, targetPath);
        }
        return targetPath;
    }

    public Path getRealProjectRoot(Long appId) throws IOException {
        Path projectRoot = getProjectRoot(appId);
        if (!Files.isDirectory(projectRoot)) {
            throw new IOException("项目目录不存在");
        }
        return projectRoot.toRealPath();
    }

    private Path getProjectRoot(Long appId) {
        if (appId == null || appId <= 0) {
            throw new IllegalArgumentException("应用 ID 不合法");
        }
        return Paths.get(AppConstant.CODE_OUTPUT_ROOT_DIR, "vue_project_" + appId)
                .toAbsolutePath()
                .normalize();
    }

    private Path resolveRelativePath(Path projectRoot, String relativePath) {
        if (StrUtil.isBlank(relativePath)) {
            throw new IllegalArgumentException("文件路径不能为空");
        }
        Path inputPath = Paths.get(relativePath);
        if (inputPath.isAbsolute()) {
            throw new IllegalArgumentException("不允许使用绝对路径");
        }
        Path targetPath = projectRoot.resolve(inputPath).normalize();
        if (!targetPath.startsWith(projectRoot)) {
            throw new IllegalArgumentException("文件路径超出项目目录");
        }
        return targetPath;
    }

    private Path verifyExistingPath(Path projectRoot, Path targetPath) throws IOException {
        Path realProjectRoot = projectRoot.toRealPath();
        Path realTargetPath = targetPath.toRealPath();
        if (!realTargetPath.startsWith(realProjectRoot)) {
            throw new IllegalArgumentException("文件路径超出项目目录");
        }
        return realTargetPath;
    }
}
