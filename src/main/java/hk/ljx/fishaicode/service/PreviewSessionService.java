package hk.ljx.fishaicode.service;

import hk.ljx.fishaicode.common.GeneratedPathResolver;
import hk.ljx.fishaicode.common.OriginUtils;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.model.vo.PreviewSessionVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Path;

/**
 * 预览会话服务：负责预览域名、生成目录检查和会话 URL 组装。
 */
@Service
public class PreviewSessionService {

    private final PreviewTokenService previewTokenService;
    private final GeneratedPathResolver generatedPathResolver;
    private final String previewOrigin;

    public PreviewSessionService(PreviewTokenService previewTokenService,
                                 GeneratedPathResolver generatedPathResolver,
                                 @Value("${app.preview-origin:http://preview.localhost:3000}") String previewOrigin) {
        this.previewTokenService = previewTokenService;
        this.generatedPathResolver = generatedPathResolver;
        this.previewOrigin = previewOrigin;
    }

    public PreviewSessionVO createPreviewSession(String previewKey) {
        if (!previewTokenService.isConfigured()) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "预览服务未配置签名密钥");
        }
        String origin = OriginUtils.normalize(previewOrigin);
        if (origin.isBlank()) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "预览服务未配置访问域名");
        }
        if (!previewTokenService.isValidPreviewKey(previewKey)) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR, "预览资源不存在");
        }
        if (!hasGeneratedCode(previewKey)) {
            throw new BusinessException(ErrorCode.NOT_FOUND_ERROR, "尚未生成代码");
        }
        String token = previewTokenService.createToken(previewKey);
        return new PreviewSessionVO(
                origin + "/api/static/" + previewKey + "/" + token + "/",
                previewTokenService.tokenTtlSeconds());
    }

    private boolean hasGeneratedCode(String previewKey) {
        long appId = previewTokenService.appIdFromPreviewKey(previewKey);
        String codeGenType = previewTokenService.codeGenTypeFromPreviewKey(previewKey);
        try {
            Path previewRoot = generatedPathResolver.resolveExistingDirectory(codeGenType, appId);
            if (CodeGenTypeEnum.VUE_PROJECT.getValue().equals(codeGenType)) {
                previewRoot = generatedPathResolver.resolveExistingDirectory(previewRoot, "dist");
            }
            return generatedPathResolver.resolveOptionalFile(previewRoot, "index.html") != null;
        } catch (IOException e) {
            return false;
        }
    }
}
