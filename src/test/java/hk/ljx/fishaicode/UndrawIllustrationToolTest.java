package hk.ljx.fishaicode;

import hk.ljx.fishaicode.workflow.model.enums.ImageCategoryEnum;
import hk.ljx.fishaicode.workflow.model.ImageResource;
import hk.ljx.fishaicode.workflow.tools.UndrawIllustrationTool;
import jakarta.annotation.Resource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

// 依赖真实 Undraw API 与 token 的集成测试：未设置 UNDRAW_TOKEN 时跳过
@EnabledIfEnvironmentVariable(named = "UNDRAW_TOKEN", matches = ".+")
@SpringBootTest
@ActiveProfiles("test")
class UndrawIllustrationToolTest {

    @Resource
    private UndrawIllustrationTool undrawIllustrationTool;

    @Test
    void testSearchIllustrations() {
        // 测试正常搜索插画
        List<ImageResource> illustrations = undrawIllustrationTool.searchIllustrations("happy");
        assertNotNull(illustrations);
        // 验证返回的插画资源
        ImageResource firstIllustration = illustrations.get(0);
        assertEquals(ImageCategoryEnum.ILLUSTRATION, firstIllustration.getCategory());
        assertNotNull(firstIllustration.getDescription());
        assertNotNull(firstIllustration.getUrl());
        assertTrue(firstIllustration.getUrl().startsWith("http"));
        System.out.println("搜索到 " + illustrations.size() + " 张插画");
        illustrations.forEach(illustration -> 
            System.out.println("插画: " + illustration.getDescription() + " - " + illustration.getUrl())
        );
    }
}
