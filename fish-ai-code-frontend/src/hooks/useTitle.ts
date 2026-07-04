import { useEffect } from 'react';
import { APP_NAME } from '@/constants';

export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} - ${APP_NAME}` : APP_NAME;
    // 去掉 cleanup 里把 title 重置为 APP_NAME 的逻辑——否则切页时旧 effect 的 cleanup
    // 先跑（瞬间设为 "Fish AI Code"），新 effect 再设，中间会闪一次 APP_NAME。
    // 下次执行 useTitle 时由新 effect 直接覆盖即可，无须清理。
  }, [title]);
}
