package hk.ljx.fishaicode.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.core.task.VirtualThreadTaskExecutor;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 虚拟线程执行器配置。
 *
 * <p>敏感审查、图片收集、提示词增强等前置任务都是 IO 密集（LLM 调用 + HTTP 搜索），
 * 用 Java 21 虚拟线程承载：创建成本极低、不占 Tomcat 平台线程，适合大量并发阻塞任务。</p>
 *
 * <p>注意：这是应用启动时创建一次的共享执行器，随 JVM 生命周期存在，无需手动关闭。</p>
 */
@Configuration
public class VirtualThreadExecutorConfig {

    /**
     * 共享虚拟线程执行器：每任务一个虚拟线程，供前置校验并行化与图片收集使用。
     */
    @Bean(name = "virtualThreadExecutor")
    public ExecutorService virtualThreadExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }

    /**
     * Spring MVC 异步执行器（SSE 流式接口用）。
     *
     * <p>Controller 返回 {@code Flux<ServerSentEvent>}（chatToGenCode 的 SSE 流）时，
     * Spring MVC 需要一个 AsyncTaskExecutor 调度异步处理。默认的 SimpleAsyncTaskExecutor
     * 每请求新建一个平台线程且无上限，高并发下线程数暴涨、内存耗尽。
     * 这里换成虚拟线程执行器：SSE 长连接是 IO 密集，每流一个虚拟线程成本极低且安全。</p>
     *
     * <p>Bean 名 applicationTaskExecutor 是 Spring Boot 的默认异步执行器名，
     * 覆盖后 SSE 异步处理自动走虚拟线程。</p>
     */
    @Bean
    public AsyncTaskExecutor applicationTaskExecutor() {
        return new VirtualThreadTaskExecutor("mvc-async-");
    }
}

