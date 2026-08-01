package hk.ljx.fishaicode.service.impl;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 应用名清洗逻辑测试：验证 AI 返回值的清洗与降级保护
 */
class AppNameCleanerTest {

    @Test
    void trimsQuotesAndPunctuation() {
        assertEquals("电商购物首页", AppServiceImpl.cleanAppName("\"电商购物首页\""));
        assertEquals("电商购物首页", AppServiceImpl.cleanAppName("「电商购物首页」"));
        assertEquals("身份证校验工具", AppServiceImpl.cleanAppName(" 身份证校验工具。"));
        assertEquals("喝水打卡", AppServiceImpl.cleanAppName("《喝水打卡》"));
    }

    @Test
    void truncatesOver15Chars() {
        String longName = "这是一个非常长的应用名称用来测试截断保护逻辑";
        String result = AppServiceImpl.cleanAppName(longName);
        assertEquals(15, result.length());
        assertEquals(longName.substring(0, 15), result);
    }

    @Test
    void returnsEmptyForBlankOrNull() {
        assertEquals("", AppServiceImpl.cleanAppName(null));
        assertEquals("", AppServiceImpl.cleanAppName("   "));
        assertEquals("", AppServiceImpl.cleanAppName("。。。"));
    }

    @Test
    void keepsShortNameAsIs() {
        assertEquals("记账", AppServiceImpl.cleanAppName("记账"));
    }
}
