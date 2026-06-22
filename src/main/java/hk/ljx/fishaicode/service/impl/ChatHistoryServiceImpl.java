package hk.ljx.fishaicode.service.impl;

import com.mybatisflex.spring.service.impl.ServiceImpl;
import hk.ljx.fishaicode.modal.entity.ChatHistory;
import hk.ljx.fishaicode.mapper.ChatHistoryMapper;
import hk.ljx.fishaicode.service.ChatHistoryService;
import org.springframework.stereotype.Service;

/**
 * 对话历史 服务层实现。
 *
 * @author fish
 */
@Service
public class ChatHistoryServiceImpl extends ServiceImpl<ChatHistoryMapper, ChatHistory>  implements ChatHistoryService {

}
