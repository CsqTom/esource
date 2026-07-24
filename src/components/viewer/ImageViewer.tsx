import { Image, Loader2 } from 'lucide-react';

interface ImageViewerProps {
  filePath: string;
  contentBase64?: string;
}

export function ImageViewer({ filePath, contentBase64 }: ImageViewerProps) {
  if (!contentBase64) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
    bmp: 'image/bmp', ico: 'image/x-icon',
  };
  const mime = mimeMap[ext] || 'image/png';
  const dataUrl = `data:${mime};base64,${contentBase64}`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto flex items-center justify-center bg-gray-900/50 p-4">
        <img
          src={dataUrl}
          alt={filePath}
          className="max-w-full max-h-full object-contain rounded shadow-lg"
          style={{ imageRendering: 'auto' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-gray-500">图片加载失败</p>';
          }}
        />
      </div>
    </div>
  );
}