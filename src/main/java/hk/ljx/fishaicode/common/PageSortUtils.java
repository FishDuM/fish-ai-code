package hk.ljx.fishaicode.common;

import cn.hutool.core.util.StrUtil;
import com.mybatisflex.core.query.QueryWrapper;
import hk.ljx.fishaicode.constant.SortConstant;

import java.util.Set;

/**
 * 分页排序工具
 */
public final class PageSortUtils {

    private PageSortUtils() {
    }

    /**
     * 对查询条件应用排序。
     * 仅在排序字段非空且属于白名单时生效，防止前端传入任意列名排序（SQL 注入 / 列枚举风险）。
     *
     * @param queryWrapper      查询条件
     * @param sortField         排序字段（前端传入）
     * @param sortOrder         排序方向（"ascend" 升序，其余按降序）
     * @param allowedSortFields 允许排序的字段白名单
     */
    public static void applySort(QueryWrapper queryWrapper, String sortField, String sortOrder,
                                 Set<String> allowedSortFields) {
        if (StrUtil.isNotBlank(sortField) && allowedSortFields.contains(sortField)) {
            queryWrapper.orderBy(sortField, SortConstant.ASC.equals(sortOrder));
        }
    }
}
