import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useRef, useCallback, useEffect, useLayoutEffect } from 'react';

interface SearchInputProps {
  onSearch: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  style?: React.CSSProperties;
}

export default function SearchInput({ onSearch, placeholder = '搜索...', debounceMs = 300, style }: SearchInputProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(onSearch);
  // Keep callbackRef pointing at the latest onSearch without writing during render.
  useLayoutEffect(() => {
    callbackRef.current = onSearch;
  }, [onSearch]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => callbackRef.current(value), debounceMs);
    },
    [debounceMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Input
      prefix={<SearchOutlined />}
      placeholder={placeholder}
      onChange={handleChange}
      allowClear
      style={style}
    />
  );
}
