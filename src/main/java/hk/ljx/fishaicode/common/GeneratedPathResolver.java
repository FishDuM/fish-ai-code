package hk.ljx.fishaicode.common;

import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;

/**
 * 将生成产物路径限制在代码输出根目录内，并统一解析为真实路径。
 */
@Component
public class GeneratedPathResolver {

    public Path resolveExistingDirectory(String codeGenType, long appId) throws IOException {
        validateAppPath(codeGenType, appId);
        Path outputRoot = outputRoot();
        Path realOutputRoot = outputRoot.toRealPath();
        Path appRoot = outputRoot.resolve(codeGenType + "_" + appId).normalize();
        if (!appRoot.startsWith(outputRoot)
                || !Files.isDirectory(appRoot, LinkOption.NOFOLLOW_LINKS)) {
            throw new NoSuchFileException(appRoot.toString());
        }
        Path realAppRoot = appRoot.toRealPath();
        if (!realAppRoot.startsWith(realOutputRoot)) {
            throw new IOException("生成目录超出输出根目录");
        }
        return realAppRoot;
    }

    public Path resolveOptionalFile(Path directory, String fileName) throws IOException {
        Path candidate = directory.toRealPath().resolve(fileName).normalize();
        if (!Files.exists(candidate, LinkOption.NOFOLLOW_LINKS)) {
            return null;
        }
        return resolveExistingFile(directory, fileName);
    }

    public Path resolveExistingDirectory(Path directory, String relativePath) throws IOException {
        Path realDirectory = directory.toRealPath();
        Path candidate = realDirectory.resolve(relativePath).normalize();
        if (!candidate.startsWith(realDirectory)
                || !Files.isDirectory(candidate)) {
            throw new NoSuchFileException(candidate.toString());
        }
        Path realPath = candidate.toRealPath();
        if (!realPath.startsWith(realDirectory)) {
            throw new IOException("目录路径超出生成目录");
        }
        return realPath;
    }

    public Path resolveExistingFile(Path directory, String relativePath) throws IOException {
        Path realDirectory = directory.toRealPath();
        Path candidate = realDirectory.resolve(relativePath).normalize();
        if (!candidate.startsWith(realDirectory)) {
            throw new IOException("文件路径超出生成目录");
        }
        if (!Files.isRegularFile(candidate)) {
            throw new NoSuchFileException(candidate.toString());
        }
        Path realFile = candidate.toRealPath();
        if (!realFile.startsWith(realDirectory)) {
            throw new IOException("文件路径超出生成目录");
        }
        return realFile;
    }

    private Path outputRoot() {
        return Path.of(AppConstant.CODE_OUTPUT_ROOT_DIR).toAbsolutePath().normalize();
    }

    private void validateAppPath(String codeGenType, long appId) {
        if (appId <= 0 || CodeGenTypeEnum.getEnumByValue(codeGenType) == null) {
            throw new IllegalArgumentException("应用生成路径不合法");
        }
    }
}
