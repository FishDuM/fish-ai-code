package hk.ljx.fishaicode.core;

import cn.hutool.json.JSONUtil;
import dev.langchain4j.model.chat.response.ChatResponse;
import dev.langchain4j.service.TokenStream;
import dev.langchain4j.service.tool.ToolExecution;
import hk.ljx.fishaicode.ai.AiCodeGeneratorService;
import hk.ljx.fishaicode.ai.AiCodeGeneratorServiceFactory;
import hk.ljx.fishaicode.ai.model.HtmlCodeResult;
import hk.ljx.fishaicode.ai.model.MultiFileCodeResult;
import hk.ljx.fishaicode.ai.model.message.AiResponseMessage;
import hk.ljx.fishaicode.ai.model.message.ToolExecutedMessage;
import hk.ljx.fishaicode.ai.model.message.ToolRequestMessage;
import hk.ljx.fishaicode.core.parser.CodeParserExecutor;
import hk.ljx.fishaicode.core.saver.CodeFileSaverExecutor;
import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import hk.ljx.fishaicode.model.enums.CodeGenTypeEnum;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.io.File;

@Slf4j
@Service
public class AiCodeGeneratorFacade {

    @Resource
    private AiCodeGeneratorServiceFactory aiCodeGeneratorServiceFactory;

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
     * 统一入口：根据类型生成并保存代码
     *
     * @param userMessage     用户提示词
     * @param codeGenTypeEnum 生成类型
     * @param appId          应用ID
     * @return 保存的目录
     */
    public File generateAndSaveCode(String userMessage, CodeGenTypeEnum codeGenTypeEnum, Long appId) {
        if (codeGenTypeEnum == null) {
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "生成类型为空");
        }
        AiCodeGeneratorService aiCodeGeneratorService = aiCodeGeneratorServiceFactory.createAiCodeGeneratorService(appId, codeGenTypeEnum);
        return switch (codeGenTypeEnum) {
            case HTML -> {
                HtmlCodeResult result = aiCodeGeneratorService.generateHtmlCode(userMessage);
                yield CodeFileSaverExecutor.executeSaver(result, CodeGenTypeEnum.HTML, appId);
            }
            case MULTI_FILE -> {
                MultiFileCodeResult result = aiCodeGeneratorService.generateMultiFileCode(userMessage);
                yield CodeFileSaverExecutor.executeSaver(result, CodeGenTypeEnum.MULTI_FILE, appId);
            }
            default -> {
                String errorMessage = "不支持的生成类型：" + codeGenTypeEnum.getValue();
                throw new BusinessException(ErrorCode.SYSTEM_ERROR, errorMessage);
            }
        };
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
                yield processCodeStream(codeStream, CodeGenTypeEnum.MULTI_FILE, appId);
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
