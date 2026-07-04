import { useState, useMemo } from 'react';
import { Typography, Space, Button, Empty, Tooltip } from 'antd';
import { CloudUploadOutlined, FileOutlined, FolderOutlined } from '@ant-design/icons';
import CodePreview from './CodePreview';

const { Text } = Typography;

interface ProjectFile {
  path: string;
  content: string;
}

interface VueProjectViewerProps {
  files: ProjectFile[];
  deploying: boolean;
  onDeploy: () => void;
}

/**
 * Vue 工程文件查看器
 * 左侧文件树，右侧文件内容预览
 */
export default function VueProjectViewer({ files, deploying, onDeploy }: VueProjectViewerProps) {
  // 记录用户最近一次点击的文件路径。实际显示哪一个由下面的 `displayFile`
  // 派生决定 —— 这样"选中文件被删除时回退到第一个"完全靠 render-time 计算，
  // 不再需要 useEffect 里 setState 触发（消除 react-hooks/set-state-in-effect
  // 警告），同时避免选中与列表分叉时的二次渲染。
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Sort files: directories first, then alphabetically
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const aParts = a.path.split('/').length;
      const bParts = b.path.split('/').length;
      if (aParts !== bParts) return aParts - bParts;
      return a.path.localeCompare(b.path);
    });
  }, [files]);

  // 派生当前要展示的文件：用户选过的且仍在列表里就用它，否则回退到第一个。
  // 取代原先 useEffect 里的 setSelectedFile 逻辑。
  const displayFile = useMemo(() => {
    if (selectedFile && sortedFiles.some((f) => f.path === selectedFile)) {
      return selectedFile;
    }
    return sortedFiles[0]?.path ?? null;
  }, [selectedFile, sortedFiles]);

  const currentContent = useMemo(() => {
    if (!displayFile) return '';
    const file = files.find((f) => f.path === displayFile);
    return file?.content || '';
  }, [displayFile, files]);

  const fileExtension = displayFile ? displayFile.split('.').pop() || '' : '';

  // Build tree structure for display
  const treeItems = useMemo(() => {
    const tree: { path: string; indent: number; name: string; isDir: boolean }[] = [];
    const seen = new Set<string>();

    for (const file of sortedFiles) {
      const parts = file.path.split('/');
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath += (i > 0 ? '/' : '') + parts[i];
        if (!seen.has(currentPath)) {
          seen.add(currentPath);
          tree.push({ path: currentPath, indent: i * 12, name: parts[i], isDir: true });
        }
      }
      const fullPath = file.path;
      if (!seen.has(fullPath)) {
        seen.add(fullPath);
        tree.push({ path: fullPath, indent: (parts.length - 1) * 12, name: parts[parts.length - 1], isDir: false });
      }
    }
    return tree;
  }, [sortedFiles]);

  // 共享一个跟随鼠标的 Tooltip：原先每个文件树节点都包一个 antd Tooltip，
  // 100 文件 = 100 Tooltip 实例，hover 时各自维护 show/hide 状态性能较差。
  // 现在只在文件树容器里挂一份 Tooltip，hover 行时通过 onMouseEnter 更新
  // 标题和锚点位置；onMouseLeave 清掉，Tooltip 自动隐藏。
  const [hovered, setHovered] = useState<{ title: string; x: number; y: number } | null>(null);

  if (files.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="暂无文件，等待 AI 生成..." />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(17,25,37,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <Space size={8}>
          <Text strong style={{ fontSize: 13, color: 'rgba(17,25,37,0.65)' }}>
            {files.length} 个文件
          </Text>
          {displayFile && (
            <Tooltip title={displayFile}>
              <Text
                style={{
                  fontSize: 12,
                  color: 'rgba(17,25,37,0.45)',
                  fontFamily: 'Menlo, Consolas, monospace',
                  maxWidth: 280,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayFile}
              </Text>
            </Tooltip>
          )}
        </Space>
        <Button
          className="btn-gradient"
          size="small"
          icon={<CloudUploadOutlined />}
          onClick={onDeploy}
          loading={deploying}
        >
          部署预览
        </Button>
      </div>

      {/* File tree + content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* File tree */}
        <div
          style={{
            width: 240,
            minWidth: 240,
            overflow: 'auto',
            borderRight: '1px solid rgba(17,25,37,0.1)',
            padding: '4px 0',
            background: 'rgba(17,25,37,0.02)',
          }}
        >
          {treeItems.map((item) => (
            <div
              key={item.path}
              onClick={() => !item.isDir && setSelectedFile(item.path)}
              onMouseEnter={(e) => {
                // 用行元素的 rect 作为 Tooltip 锚点，比 clientX/clientY 更稳：
                // 行内移动鼠标时锚点不抖动，tooltip 也保持在该行高度范围内。
                const rect = e.currentTarget.getBoundingClientRect();
                setHovered({ title: item.path, x: rect.right, y: rect.top + rect.height / 2 });
              }}
              onMouseLeave={() => setHovered(null)}
              style={{
                padding: '4px 8px 4px ' + (12 + item.indent) + 'px',
                cursor: item.isDir ? 'default' : 'pointer',
                background: displayFile === item.path ? 'rgba(54,210,190,0.12)' : 'transparent',
                borderLeft: displayFile === item.path ? '2px solid #36D2BE' : '2px solid transparent',
                margin: '1px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                color: item.isDir ? 'rgba(17,25,37,0.45)' : (displayFile === item.path ? '#36D2BE' : '#111925'),
                fontWeight: item.isDir ? 500 : (displayFile === item.path ? 500 : 400),
              }}
            >
              {item.isDir ? (
                <FolderOutlined style={{ fontSize: 12, color: 'rgba(17,25,37,0.3)' }} />
              ) : (
                <FileOutlined style={{ fontSize: 12, color: 'rgba(17,25,37,0.3)' }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
            </div>
          ))}
          {/* 单例 Tooltip：用 1x1 的 fixed span 当锚点跟随鼠标；open 受控。
              mouseEnterDelay=0 让 hover 立即显示，避免原生 antd 默认 0.1s 延迟。
              pointerEvents:none 保证锚点不阻挡 hover/click 事件穿透到下方树行。 */}
          <Tooltip
            title={hovered?.title || ''}
            open={!!hovered}
            placement="right"
            mouseEnterDelay={0}
          >
            <span
              aria-hidden
              style={{
                position: 'fixed',
                left: hovered?.x ?? -9999,
                top: hovered?.y ?? -9999,
                width: 1,
                height: 1,
                pointerEvents: 'none',
              }}
            />
          </Tooltip>
        </div>

        {/* File content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {currentContent ? (
            <CodePreview code={currentContent} language={fileExtension} />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(17,25,37,0.45)', fontSize: 13 }}>
              选择一个文件查看内容
            </div>
          )}
        </div>
      </div>
    </div>
  );
}