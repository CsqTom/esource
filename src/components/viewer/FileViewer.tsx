import { ImageViewer } from './ImageViewer';
import { TextViewer } from './TextViewer';

interface FileViewerProps {
  filePath: string;
  repoPath: string;
  /** 文件内容（文本） */
  content?: string;
  /** 文件内容 base64（用于图片等二进制文件） */
  contentBase64?: string;
  /** 文件是否在加载中 */
  loading?: boolean;
}

/** 根据文件后缀选择渲染器 */
export function FileViewer({ filePath, repoPath, content, contentBase64, loading }: FileViewerProps) {
  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><div className="text-gray-500">加载中...</div></div>;
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  // 图片文件
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return <ImageViewer filePath={filePath} contentBase64={contentBase64} />;
  }

  // 其他文件：文本模式
  return <TextViewer filePath={filePath} content={content || ''} />;
}