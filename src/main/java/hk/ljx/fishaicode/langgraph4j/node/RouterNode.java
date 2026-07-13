package hk.ljx.fishaicode.langgraph4j.node;

import hk.ljx.fishaicode.ai.AiCodeGenTypeRoutingService;
import hk.ljx.fishaicode.ai.AiCodeGenTypeRoutingServiceFactory;
import hk.ljx.fishaicode.langgraph4j.state.WorkflowContext;
import hk.ljx.fishaicode.modal.enums.CodeGenTypeEnum;
import hk.ljx.fishaicode.ai.SensitiveCheckFactory;
import hk.ljx.fishaicode.utils.SpringContextUtil;
import lombok.extern.slf4j.Slf4j;
import org.bsc.langgraph4j.action.AsyncNodeAction;
import org.bsc.langgraph4j.prebuilt.MessagesState;

import static org.bsc.langgraph4j.action.AsyncNodeAction.node_async;

@Slf4j
public class RouterNode {

    public static AsyncNodeAction<MessagesState<String>> create() {
        return node_async(state -> {
            WorkflowContext context = WorkflowContext.getContext(state);
            log.info("执行节点: 智能路由");

            CodeGenTypeEnum generationType;
            // AI 内容安全审查（放在 try 外部，违规直接中断工作流）
            try {
                SensitiveCheckFactory checkFactory = SpringContextUtil.getBean(SensitiveCheckFactory.class);
                String checkResult = checkFactory.create().verify(context.getOriginalPrompt());
                if (!"PASS".equals(checkResult.trim())) {
                    log.warn("AI内容安全审查未通过: {}", checkResult);
                    throw new RuntimeException("输入内容包含违规信息: " + checkResult);
                }
            } catch (Exception e) {
                log.error("AI内容安全审查失败: {}", e.getMessage());
                throw e;
            }
            try {
                // 获取AI路由服务工厂并创建新的路由服务实例
                AiCodeGenTypeRoutingServiceFactory factory = SpringContextUtil.getBean(AiCodeGenTypeRoutingServiceFactory.class);
                AiCodeGenTypeRoutingService routingService = factory.createAiCodeGenTypeRoutingService();
                // 根据原始提示词进行智能路由
                generationType = routingService.routeCodeGenType(context.getOriginalPrompt());
                log.info("AI智能路由完成，选择类型: {} ({})", generationType.getValue(), generationType.getText());
            } catch (Exception e) {
                log.error("AI智能路由失败，使用默认HTML类型: {}", e.getMessage());
                generationType = CodeGenTypeEnum.HTML;
            }

            // 更新状态
            context.setCurrentStep("智能路由");
            context.setGenerationType(generationType);
            return WorkflowContext.saveContext(context);
        });
    }
}

