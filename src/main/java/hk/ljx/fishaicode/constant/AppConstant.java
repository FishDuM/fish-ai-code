package hk.ljx.fishaicode.constant;

/**
 * 应用常量
 */
public interface AppConstant {

    /**
     * 精选应用优先级（设置为该值表示精选应用）
     */
    int FEATURED_PRIORITY = 99;

    /**
     * 应用生成目录
     */
    String CODE_OUTPUT_ROOT_DIR = System.getProperty("user.dir") + "/tmp/code_output";

    /**
     * 应用部署目录
     */
    String CODE_DEPLOY_ROOT_DIR = System.getProperty("user.dir") + "/tmp/code_deploy";

    /**
     * 应用部署域名
     */
    String CODE_DEPLOY_HOST = "http://localhost";

}
