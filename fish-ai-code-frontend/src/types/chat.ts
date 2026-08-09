export interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createTime: string;
  /** 仅流式气泡运行时存在，历史记录无此字段 */
  isStreaming?: boolean;
}
