package hk.ljx.fishaicode.core;

import cn.hutool.core.io.FileUtil;
import cn.hutool.core.util.IdUtil;
import cn.hutool.core.util.StrUtil;
import hk.ljx.fishaicode.ai.modal.HtmlCodeResult;
import hk.ljx.fishaicode.ai.modal.MultiFileCodeResult;
import hk.ljx.fishaicode.constant.AppConstant;
import hk.ljx.fishaicode.modal.enums.CodeGenTypeEnum;

import java.io.File;
import java.nio.charset.StandardCharsets;

@Deprecated
public class CodeFileSaver {

    // 保存 HTML 网页代码
    public static File saveHtml(HtmlCodeResult htmlCodeResult) {
        String baseDirPath = buildUniqueDir(CodeGenTypeEnum.HTML.getValue());
        writeToFile(baseDirPath, "index.html", htmlCodeResult.getHtmlCode());
        return new File(baseDirPath);
    }

    // 保存多文件代码
    public static File saveMultiFile(MultiFileCodeResult multiFileCodeResult) {
        String baseDirPath = buildUniqueDir(CodeGenTypeEnum.MULTI_FILE.getValue());
        writeToFile(baseDirPath, "index.html", multiFileCodeResult.getHtmlCode());
        writeToFile(baseDirPath, "stule.css", multiFileCodeResult.getCssCode());
        writeToFile(baseDirPath, "script.js", multiFileCodeResult.getJsCode());
        return new File(baseDirPath);
    }


    // 构建文件的唯一路径 业务类型+雪花ID (tmp/code_output/bizType + 雪花ID)
    private static String buildUniqueDir(String bizType) {
        String uniqueDirName = StrUtil.format("{}_{}",  bizType, IdUtil.getSnowflakeNextIdStr());
        String dirPath = AppConstant.CODE_OUTPUT_ROOT_DIR + File.separator + uniqueDirName;
        FileUtil.mkdir(dirPath);
        return dirPath;
    }

    // 保存单个文件
    private static void writeToFile(String dirPath, String fileName, String content) {
        String filePath = dirPath + File.separator + fileName;
        FileUtil.writeString(content, filePath, StandardCharsets.UTF_8);
    }

}
