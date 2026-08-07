import { useCallback, useRef } from 'react';
import { FileChangeItem } from '../../types';
import { FileItem } from './FileItem';

interface FileListProps {
  files: FileChangeItem[];
  selectedFiles: string[];  // 支持多选
  onFileClick: (file: FileChangeItem, e: React.MouseEvent) => void;
  onStageFile: (file: string) => void;
  onUnstageFile: (file: string) => void;
  onDiscardFile: (file: string) => void;
  repoPath: string;
  onRefreshStatus?: () => void;
}

export function FileList({
  files,
  selectedFiles,
  onFileClick,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  repoPath,
  onRefreshStatus,
}: FileListProps) {
  // 判断文件是否被选中
  const isSelected = useCallback((file: FileChangeItem): boolean => {
    return selectedFiles.includes(file.path);
  }, [selectedFiles]);

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
        没有文件变更
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-800">
      {files.map((file) => (
        <FileItem
          key={file.path + (file.staged ? '-staged' : '')}
          file={file}
          isSelected={isSelected(file)}
          onClick={(e) => onFileClick(file, e)}
          onStage={() => onStageFile(file.path)}
          onUnstage={() => onUnstageFile(file.path)}
          onDiscard={() => onDiscardFile(file.path)}
          repoPath={repoPath}
          onRefreshStatus={onRefreshStatus}
        />
      ))}
    </div>
  );
}