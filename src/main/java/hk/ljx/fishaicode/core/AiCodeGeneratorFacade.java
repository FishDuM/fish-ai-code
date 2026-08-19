package hk.ljx.fishaicode.core;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.service.TokenStream;
import dev.langchain4j.service.tool.ToolExecution;
import hk.ljx.fishaicode.ai.AiCodeGeneratorService;
import hk.ljx.fishaicode.ai.AiCodeGeneratorServiceFactory;
import hk.ljx.fishaicode.ai.model.MultiFileCodeResult;
import hk.ljx.fishaicode.ai.model.message.AiResponseMessage;
import hk.ljx.fishaicode.ai.model.message.ToolExecutedMessage;
import hk.ljx.fishaicode.ai.model.message.ToolRequestMessage;
import hk.ljx.fishaicode.core.parser.CodeParserExecutor;
import hk.ljx.fishaicode.core.saver.CodeFileSaverExecutor;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.io.File;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiCodeGeneratorFacade {

    private final AiCodeGeneratorServiceFactory aiCodeGeneratorServiceFactory;

    /**
     * 通用流式代码处理方法
     *
     * @param codeStream  代码流
     * @param codeGenType 代码生成类型
     * @return 流式响应
     */
    Flux<String> processCodeStream(Flux<String> codeStream, CodeGenTypeEnum codeGenType, Long appId) {
        return Flux.create(sink -> {
            StringBuilder codeBuilder = new StringBuilder();
            codeStream.subscribe(
                    chunk -> {
                        codeBuilder.append(chunk);
                        sink.next(chunk);
                    },
                    sink::error,
                    () -> {
                        try {
                            String completeCode = codeBuilder.toString();
                            Object parsedResult = CodeParserExecutor.executeParser(completeCode, codeGenType);
                            File savedDir = CodeFileSaverExecutor.executeSaver(parsedResult, codeGenType, appId);
                            log.info("保存成功，路径为：{}", savedDir.getAbsolutePath());
                            // 只有持久化成功才向下游发送完成信号。
                            sink.complete();
                        } catch (Exception e) {
                            log.error("代码保存失败，appId: {}, 类型: {}", appId, codeGenType, e);
                            sink.error(new BusinessException(ErrorCode.OPERATION_ERROR, "代码保存失败，请重试"));
                        }
                    }
            );
        });
    }

    /**
     * 统一入口：根据类型生成并保存代码（流式）
     *
     * @param userMessage     用户提示词
     * @param codeGenTypeEnum 生成类型
     * @param appId          应用ID
     */
    public Flux<String> generateAndSaveCodeStream(String userMessage, CodeGenTypeEnum codeGenTypeEnum, Long appId) {
        return generateAndSaveCodeStream(userMessage, codeGenTypeEnum, appId, null);
    }

    /**
     * 流式生成入口。初始需求只用于构建受限的长期项目背景，不会写入用户可见聊天内容。
     */
    public Flux<String> generateAndSaveCodeStream(String userMessage, CodeGenTypeEnum codeGenTypeEnum,
                                                   Long appId, String initPrompt) {
        if (codeGenTypeEnum == null) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "生成类型为空");
        }
        AiCodeGeneratorService aiCodeGeneratorService = aiCodeGeneratorServiceFactory
                .createAiCodeGeneratorService(appId, codeGenTypeEnum, initPrompt);
        return switch (codeGenTypeEnum) {
            case HTML -> {
                Flux<String> codeStream = aiCodeGeneratorService.generateHtmlCodeStream(userMessage);
                yield processCodeStream(codeStream, CodeGenTypeEnum.HTML, appId);
            }
            case MULTI_FILE -> {
                Flux<String> codeStream = aiCodeGeneratorService.generateMultiFileCodeStream(userMessage);
                yield processMultiFileCodeStream(codeStream, appId);
            }
            case VUE_PROJECT -> {
                TokenStream tokenStream = aiCodeGeneratorService.generateVueProjectCodeStream(appId, userMessage);
                yield processTokenStream(tokenStream);
            }
            default -> {
                String errorMessage = "不支持的生成类型：" + codeGenTypeEnum.getValue();
                throw new BusinessException(ErrorCode.SYSTEM_ERROR, errorMessage);
            }
        };
    }

    /**
     * MULTI_FILE 流式处理：边生成边推送，结束时解析并校验完整性。
     * 缺 CSS/JS 时不落盘、直接报错让用户重新生成（不做自动重生成覆盖已显示内容）。
     */
    private Flux<String> processMultiFileCodeStream(Flux<String> codeStream, Long appId) {
        return Flux.create(sink -> {
            StringBuilder codeBuilder = new StringBuilder();
            codeStream.subscribe(
                    chunk -> {
                        codeBuilder.append(chunk);
                        sink.next(chunk);
                    },
                    sink::error,
                    () -> {
                        String completeCode = codeBuilder.toString();
                        try {
                            MultiFileCodeResult parsedResult =
                                    (MultiFileCodeResult) CodeParserExecutor.executeParser(completeCode, CodeGenTypeEnum.MULTI_FILE);
                            if (isMissingReferencedFiles(parsedResult)) {
                                log.warn("多文件生成缺少 CSS/JS 代码块（html:{}B css:{}B js:{}B），拒绝保存残缺产物，appId: {}",
                                        StrUtil.length(parsedResult.getHtmlCode()),
                                        StrUtil.length(parsedResult.getCssCode()),
                                        StrUtil.length(parsedResult.getJsCode()),
                                        appId);
                                sink.error(new BusinessException(ErrorCode.OPERATION_ERROR,
                                        "生成结果缺少 CSS/JS 文件，请重新生成"));
                                return;
                            }
                            File savedDir = CodeFileSaverExecutor.executeSaver(parsedResult, CodeGenTypeEnum.MULTI_FILE, appId);
                            log.info("保存成功，路径为：{}", savedDir.getAbsolutePath());
                            sink.complete();
                        } catch (Exception e) {
                            log.error("代码保存失败，appId: {}, 类型: {}", appId, CodeGenTypeEnum.MULTI_FILE, e);
                            sink.error(new BusinessException(ErrorCode.OPERATION_ERROR, "代码保存失败，请重试"));
                        }
                    }
            );
        }, FluxSink.OverflowStrategy.BUFFER);
    }

    /**
     * 完整性校验：HTML 引用了 style.css / script.js，但对应代码块为空 → 缺文件。
     */
    private boolean isMissingReferencedFiles(MultiFileCodeResult result) {
        String htmlCode = result.getHtmlCode();
        if (StrUtil.isBlank(htmlCode)) {
            return false;
        }
        boolean missingCss = StrUtil.isBlank(result.getCssCode()) && htmlCode.contains("style.css");
        boolean missingJs = StrUtil.isBlank(result.getJsCode()) && htmlCode.contains("script.js");
        return missingCss || missingJs;
    }

    /**
     * TokenStream转换为Flux<String>
     * @param tokenStream
     * @return
     */
    private Flux<String> processTokenStream(TokenStream tokenStream) {
        return Flux.create(sink -> {
            tokenStream.onPartialResponse((String partialResponse) -> {
                        AiResponseMessage aiResponseMessage = new AiResponseMessage(partialResponse);
                        sink.next(JSONUtil.toJsonStr(aiResponseMessage));
                    })
                    .onPartialToolCall(partialToolCall -> {
                        ToolRequestMessage toolRequestMessage = new ToolRequestMessage(partialToolCall);
                        sink.next(JSONUtil.toJsonStr(toolRequestMessage));
                    })
                    .onToolExecuted((ToolExecution toolExecution) -> {
                        ToolExecutedMessage toolExecutedMessage = new ToolExecutedMessage(toolExecution);
                        sink.next(JSONUtil.toJsonStr(toolExecutedMessage));
                    })
                    .onCompleteResponse((ChatResponse response) -> {
                        sink.complete();
                    })
                    .onError((Throwable error) -> {
                        log.error("AI 流式响应出错", error);
                        sink.error(error);
                    })
                    .start();
        });

    }


}
