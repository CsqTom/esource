import { useState, useCallback, useEffect } from 'react';

interface ResizableDividerProps {
  /** 初始宽度（像素） */
  initialWidth: number;
  /** 最小宽度（像素） */
  minWidth?: number;
  /** 最大宽度（像素） */
  maxWidth?: number;
  /** 宽度变化回调 */
  onWidthChange?: (width: number) => void;
  /** 分隔条方向 */
  direction?: 'left' | 'right'; // left: 左侧面板，right: 右侧面板
}

/**
 * 可拖动调整大小的分隔条组件
 * 用于调整两个面板之间的宽度
 */
export function ResizableDivider({
  initialWidth,
  minWidth = 200,
  maxWidth = 800,
  onWidthChange,
  direction = 'left',
}: ResizableDividerProps) {
  const [width, setWidth] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      let newWidth: number;
      if (direction === 'left') {
        // 左侧面板：鼠标X坐标就是宽度
        newWidth = e.clientX;
      } else {
        // 右侧面板：窗口宽度减去鼠标X坐标
        newWidth = window.innerWidth - e.clientX;
      }

      // 限制宽度范围
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setWidth(newWidth);
      onWidthChange?.(newWidth);
    },
    [isDragging, minWidth, maxWidth, onWidthChange, direction]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return {
    width,
    dividerProps: {
      onMouseDown: handleMouseDown,
      className: `w-1 bg-gray-700 cursor-col-resize hover:bg-blue-500 transition-colors flex-shrink-0 ${
        isDragging ? 'bg-blue-500' : ''
      }`,
    },
  };
}