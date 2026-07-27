package hk.ljx.fishaicode.core;

import hk.ljx.fishaicode.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.redisson.api.RFuture;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GenerationCoordinatorTest {

    @Test
    void rejectsConcurrentGenerationWithoutStartingAnotherModelRequest() {
        RedissonClient redissonClient = mock(RedissonClient.class);
        RLock lock = mock(RLock.class);
        when(redissonClient.getLock("app:generation:42")).thenReturn(lock);
        when(lock.tryLock()).thenReturn(false);
        AtomicBoolean started = new AtomicBoolean(false);

        GenerationCoordinator coordinator = new GenerationCoordinator(redissonClient);

        assertThrows(BusinessException.class,
                () -> coordinator.execute(42, () -> {
                    started.set(true);
                    return Flux.just("should-not-run");
                }).collectList().block());
        assertFalse(started.get());
    }

    @Test
    @SuppressWarnings("unchecked")
    void releasesLockOnlyAfterGenerationCompletes() {
        RedissonClient redissonClient = mock(RedissonClient.class);
        RLock lock = mock(RLock.class);
        RFuture<Void> unlockFuture = mock(RFuture.class);
        when(redissonClient.getLock("app:generation:7")).thenReturn(lock);
        when(lock.tryLock()).thenReturn(true);
        when(lock.unlockAsync(anyLong())).thenReturn(unlockFuture);
        when(unlockFuture.whenComplete(any())).thenReturn(unlockFuture);

        GenerationCoordinator coordinator = new GenerationCoordinator(redissonClient);

        List<String> result = coordinator.execute(7, () -> Flux.just("first", "second"))
                .collectList()
                .block();

        assertEquals(List.of("first", "second"), result);
        verify(lock).unlockAsync(anyLong());
    }

    @Test
    void deploymentOrDownloadIsRejectedWhileGenerationLockIsHeld() {
        RedissonClient redissonClient = mock(RedissonClient.class);
        RLock lock = mock(RLock.class);
        when(redissonClient.getLock("app:generation:9")).thenReturn(lock);
        when(lock.tryLock()).thenReturn(false);

        GenerationCoordinator coordinator = new GenerationCoordinator(redissonClient);

        assertThrows(BusinessException.class,
                () -> coordinator.executeExclusively(9, () -> "should-not-run"));
    }

    @Test
    void reportsWhetherAnApplicationTaskLockIsHeld() {
        RedissonClient redissonClient = mock(RedissonClient.class);
        RLock lock = mock(RLock.class);
        when(redissonClient.getLock("app:generation:11")).thenReturn(lock);
        when(lock.isLocked()).thenReturn(true);

        GenerationCoordinator coordinator = new GenerationCoordinator(redissonClient);

        assertTrue(coordinator.isBusy(11));
    }
}
