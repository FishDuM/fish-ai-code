package hk.ljx.fishaicode.service.impl;

import com.mybatisflex.spring.service.impl.ServiceImpl;
import hk.ljx.fishaicode.modal.entity.App;
import hk.ljx.fishaicode.mapper.AppMapper;
import hk.ljx.fishaicode.service.AppService;
import org.springframework.stereotype.Service;

/**
 * 应用 服务层实现。
 *
 * @author fish
 */
@Service
public class AppServiceImpl extends ServiceImpl<AppMapper, App>  implements AppService{

}
