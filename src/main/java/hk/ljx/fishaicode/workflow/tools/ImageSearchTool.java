package hk.ljx.fishaicode.workflow.tools;

import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import dev.langchain4j.agent.tool.P;
import dev.langchain4j.agent.tool.Tool;
import hk.ljx.fishaicode.workflow.model.enums.ImageCategoryEnum;
import hk.ljx.fishaicode.workflow.model.ImageResource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
public class ImageSearchTool {

    private static final String PEXELS_API_URL = "https://api.pexels.com/v1/search";

    @Value("${pexels.api-key}")
    private String pexelsApiKey;

    @Tool("搜索内容相关的图片，用于网站内容展示")
    public List<ImageResource> searchContentImages(@P("搜索关键词") String query) {
        List<ImageResource> imageList = new ArrayList<>();
        int searchCount = 2;
        // 调用 API，注意释放资源；设置超时防止外部 API 挂起导致生成请求永久阻塞
        try (HttpResponse response = HttpRequest.get(PEXELS_API_URL)
                .header("Authorization", pexelsApiKey)
                .form("query", query)
                .form("per_page", searchCount)
                .form("page", 1)
                .timeout(5000)
                .execute()) {
            if (response.isOk()) {
                JSONObject result = JSONUtil.parseObj(response.body());
                if (result != null) {
                    JSONArray photos = result.getJSONArray("photos");
                    if (photos != null) {
                        for (int i = 0; i < photos.size(); i++) {
                            JSONObject photo = photos.getJSONObject(i);
                            if (photo == null) continue;
                            JSONObject src = photo.getJSONObject("src");
                            if (src == null) continue;
                            String url = src.getStr("medium");
                            if (url != null && !url.isBlank()) {
                                imageList.add(ImageResource.builder()
                                        .category(ImageCategoryEnum.CONTENT)
                                        .description(photo.getStr("alt", query))
                                        .url(url)
                                        .build());
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            log.error("Pexels API 调用失败: {}", e.getMessage(), e);
        }
        return imageList;
    }
}
