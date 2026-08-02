package hk.ljx.fishaicode.core;

import hk.ljx.fishaicode.exception.BusinessException;
import hk.ljx.fishaicode.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

/** 同一应用的生成任务串行执行，锁在模型流结束后释放。 */
@Slf4j
@Component
public class GenerationCoordinator {

    private static final String LOCK_KEY_PREFIX = "app:generation:";

    private final RedissonClient redissonClient;

    public GenerationCoordinator(RedissonClient redissonClient) {
        this.redissonClient = redissonClient;
    }

    /**
     * 获取应用级锁后开始生成。重复请求不会加入队列，而是立即失败，避免旧请求覆盖新请求。
     */
    public Flux<String> execute(long appId, Supplier<Flux<String>> generationFactory) {
        return Flux.create(clientSink -> {
            RLock lock = redissonClient.getLock(LOCK_KEY_PREFIX + appId);
            long ownerThreadId = Thread.currentThread().threadId();
            final boolean locked;
            try {
                locked = lock.tryLock();
            } catch (Exception e) {
                log.error("获取应用生成锁失败，appId: {}", appId, e);
                clientSink.error(new BusinessException(ErrorCode.SYSTEM_ERROR, "暂时无法创建生成任务，请稍后重试"));
                return;
            }
            if (!locked) {
                clientSink.error(new BusinessException(ErrorCode.OPERATION_ERROR, "该应用正在生成，请等待当前任务结束"));
                return;
            }

            AtomicBoolean released = new AtomicBoolean(false);
            Runnable releaseLock = () -> releaseLock(lock, ownerThreadId, appId, released);
            final Flux<String> generationFlux;
            try {
                generationFlux = generationFactory.get();
            } catch (Throwable e) {
                clientSink.error(e);
                releaseLock.run();
                return;
            }

            // 客户端断开后仍等待生成流自行结束，避免后台继续写入时提前解锁。
            generationFlux
                    .doFinally(signalType -> releaseLock.run())
                    .subscribe(
                            clientSink::next,
                            error -> {
                                clientSink.error(error);
                                releaseLock.run();
                            },
                            () -> {
                                clientSink.complete();
                                releaseLock.run();
                            }
                    );
        }, FluxSink.OverflowStrategy.BUFFER);
    }

    /** 执行需要读取稳定项目目录的操作。 */
    public <T> T executeExclusively(long appId, Supplier<T> action) {
        RLock lock = redissonClient.getLock(LOCK_KEY_PREFIX + appId);
        final boolean locked;
        try {
            locked = lock.tryLock();
        } catch (Exception e) {
            log.error("获取应用任务锁失败，appId: {}", appId, e);
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "暂时无法执行该操作，请稍后重试");
        }
        if (!locked) {
            throw new BusinessException(ErrorCode.OPERATION_ERROR, "应用正在生成或部署，请等待当前任务结束");
        }
        try {
            return action.get();
        } finally {
            try {
                lock.unlock();
            } catch (Exception e) {
                log.error("释放应用任务锁失败，appId: {}", appId, e);
            }
        }
    }

    /** 查询应用是否仍有生成或读取项目目录的任务在执行。 */
    public boolean isBusy(long appId) {
        try {
            return redissonClient.getLock(LOCK_KEY_PREFIX + appId).isLocked();
        } catch (Exception e) {
            log.error("查询应用任务状态失败，appId: {}", appId, e);
            throw new BusinessException(ErrorCode.SYSTEM_ERROR, "暂时无法查询生成状态，请稍后重试");
        }
    }

    private void releaseLock(RLock lock, long ownerThreadId, long appId, AtomicBoolean released) {
        if (!released.compareAndSet(false, true)) {
            return;
        }
        try {
            // 回调线程可能与加锁线程不同。
            lock.unlockAsync(ownerThreadId).whenComplete((unused, error) -> {
                if (error != null) {
                    if (error.getCause() instanceof IllegalMonitorStateException) {
                        log.warn("释放应用生成锁时锁已不存在（可能已过期或已被释放），appId: {}，按已释放处理", appId);
                    } else {
                        log.error("释放应用生成锁失败，appId: {}", appId, error);
                    }
                }
            });
        } catch (Exception e) {
            log.error("释放应用生成锁失败，appId: {}", appId, e);
        }
    }
}
