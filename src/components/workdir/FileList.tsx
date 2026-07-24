import { FileChangeItem } from '../../types';
import { FileItem } from './FileItem';

interface FileListProps {
  files: FileChangeItem[];
  selectedFile: string | null;
  onFileClick: (file: FileChangeItem) => void;
  onStageFile: (file: string) => void;
  onUnstageFile: (file: string) => void;
  onDiscardFile: (file: string) => void;
}

export function FileList({
  files,
  selectedFile,
  onFileClick,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
}: FileListProps) {
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
          isSelected={selectedFile === file.path}
          onClick={() => onFileClick(file)}
          onStage={() => onStageFile(file.path)}
          onUnstage={() => onUnstageFile(file.path)}
          onDiscard={() => onDiscardFile(file.path)}
        />
      ))}
    </div>
  );
}