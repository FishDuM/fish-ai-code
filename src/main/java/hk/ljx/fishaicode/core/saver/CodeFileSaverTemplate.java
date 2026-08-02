package hk.ljx.fishaicode.core.saver;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.StrUtil;
import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * 抽象代码文件保存器 - 模板方法模式
 *
 */
public abstract class CodeFileSaverTemplate<T> {

    /**
     * 模板方法：保存代码的标准流程
     *
     * @param result 代码结果对象
     * @param appId 应用ID
     * @return 保存的目录
     */
    public final File saveCode(T result, Long appId) {
        validateInput(result);
        Path targetDir = buildTargetDir(appId);
        Path tempDir = null;
        Path backupDir = null;
        try {
            Files.createDirectories(targetDir.getParent());
            tempDir = Files.createTempDirectory(targetDir.getParent(), "." + targetDir.getFileName() + "-");
            saveFiles(result, tempDir.toString());
            if (Files.exists(targetDir)) {
                backupDir = targetDir.resolveSibling("." + targetDir.getFileName() + "-backup-" + System.nanoTime());
                move(targetDir, backupDir);
            }
            move(tempDir, targetDir);
            tempDir = null;
            if (backupDir != null) {
                FileUtil.del(backupDir.toFile());
            }
            return targetDir.toFile();
        } catch (Exception e) {
            if (backupDir != null && !Files.exists(targetDir) && Files.exists(backupDir)) {
                try {
                    move(backupDir, targetDir);
                } catch (Exception restoreError) {
                    e.addSuppressed(restoreError);
                }
            }
            throw new BusinessException(ErrorCode.OPERATION_ERROR, "保存代码文件失败");
        } finally {
            if (tempDir != null) {
                FileUtil.del(tempDir.toFile());
            }
        }
    }

    /**
     * 验证输入参数（可由子类覆盖）
     *
     * @param result 代码结果对象
     */
    protected void validateInput(T result) {
        if (result == null) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "代码结果对象不能为空");
        }
    }

    /**
     * 构建唯一目录路径
     *
     * @param appId 应用ID
     * @return 目录路径
     */
    protected final Path buildTargetDir(Long appId) {
        if (appId == null) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "应用ID不能为空");
        }
        String codeType = getCodeType().getValue();
        String uniqueDirName = StrUtil.format("{}_{}", codeType, appId);
        return Path.of(AppConstant.CODE_OUTPUT_ROOT_DIR, uniqueDirName).toAbsolutePath().normalize();
    }

    /**
     * 写入单个文件的工具方法
     *
     * @param dirPath  目录路径
     * @param filename 文件名
     * @param content  文件内容
     */
    protected final void writeToFile(String dirPath, String filename, String content) {
        String filePath = dirPath + File.separator + filename;
        FileUtil.writeString(content == null ? "" : content, filePath, StandardCharsets.UTF_8);
    }

    private void move(Path source, Path target) throws java.io.IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(source, target);
        }
    }

    /**
     * 获取代码类型（由子类实现）
     *
     * @return 代码生成类型
     */
    protected abstract CodeGenTypeEnum getCodeType();

    /**
     * 保存文件的具体实现（由子类实现）
     *
     * @param result      代码结果对象
     * @param baseDirPath 基础目录路径
     */
    protected abstract void saveFiles(T result, String baseDirPath);
}
