package hk.ljx.fishaicode;

import hk.ljx.fishaicode.workflow.model.enums.ImageCategoryEnum;
import hk.ljx.fishaicode.workflow.model.ImageResource;
import hk.ljx.fishaicode.workflow.tools.ImageSearchTool;
import lombok.RequiredArgsConstructor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

// 依赖真实 Pexels API 与 key 的集成测试：未设置 PEXELS_API_KEY 时跳过
@EnabledIfEnvironmentVariable(named = "PEXELS_API_KEY", matches = ".+")
@SpringBootTest
@ActiveProfiles("test")
@RequiredArgsConstructor
class ImageSearchToolTest {

    private final ImageSearchTool imageSearchTool;

    @Test
    void testSearchContentImages() {
        // 测试正常搜索
        List<ImageResource> images = imageSearchTool.searchContentImages("technology");
        assertNotNull(images);
        assertFalse(images.isEmpty());
        // 验证返回的图片资源
        ImageResource firstImage = images.get(0);
        assertEquals(ImageCategoryEnum.CONTENT, firstImage.getCategory());
        assertNotNull(firstImage.getDescription());
        assertNotNull(firstImage.getUrl());
        assertTrue(firstImage.getUrl().startsWith("http"));
        System.out.println("搜索到 " + images.size() + " 张图片");
        images.forEach(image ->
                System.out.println("图片: " + image.getDescription() + " - " + image.getUrl())
        );
    }
}
