import { useState, useCallback, useEffect, useRef } from 'react';

interface ResizableDividerProps {
  /** 初始尺寸（像素）：水平方向为宽度，垂直方向为高度 */
  initialSize: number;
  /** 最小尺寸（像素） */
  minSize?: number;
  /** 最大尺寸（像素） */
  maxSize?: number;
  /** 尺寸变化回调 */
  onSizeChange?: (size: number) => void;
  /** 分隔条方向：horizontal=左右拖动调整宽度，vertical=上下拖动调整高度 */
  orientation?: 'horizontal' | 'vertical';
  /**
   * 仅 horizontal 生效：
   * left=左侧面板（鼠标 X 坐标即宽度），right=右侧面板（窗口宽度减鼠标 X 坐标）
   */
  direction?: 'left' | 'right';
}

/**
 * 可拖动调整大小的分隔条组件
 * 支持水平（左右调整宽度）和垂直（上下调整高度）两种方向
 *
 * 垂直方向通过 mousedown 时记录"容器顶部相对视口的 Y 偏移"，
 * 从而无需使用方传入 containerRef 即可正确计算上方面板高度。
 */
export function ResizableDivider({
  initialSize,
  minSize = 200,
  maxSize = 800,
  onSizeChange,
  orientation = 'horizontal',
  direction = 'left',
}: ResizableDividerProps) {
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  // 垂直方向下：容器顶部相对视口的 Y 坐标（mousedown 时计算）
  const containerTopRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (orientation === 'vertical') {
      // 由"鼠标 Y - 当前面板高度 = 容器顶部 Y"反推容器顶部偏移
      containerTopRef.current = e.clientY - size;
    }
    setIsDragging(true);
  }, [orientation, size]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      let newSize: number;
      if (orientation === 'vertical') {
        // 垂直方向：上方面板高度 = 鼠标 Y - 容器顶部 Y
        newSize = e.clientY - containerTopRef.current;
      } else if (direction === 'left') {
        // 左侧面板：鼠标X坐标就是宽度
        newSize = e.clientX;
      } else {
        // 右侧面板：窗口宽度减去鼠标X坐标
        newSize = window.innerWidth - e.clientX;
      }

      // 限制尺寸范围
      newSize = Math.max(minSize, Math.min(maxSize, newSize));
      setSize(newSize);
      onSizeChange?.(newSize);
    },
    [isDragging, minSize, maxSize, onSizeChange, orientation, direction]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = orientation === 'vertical' ? 'row-resize' : 'col-resize';
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
  }, [isDragging, handleMouseMove, handleMouseUp, orientation]);

  // 兼容旧字段名 width
  return {
    size,
    width: size,
    dividerProps: {
      onMouseDown: handleMouseDown,
      className:
        orientation === 'vertical'
          ? `h-1 bg-gray-700 cursor-row-resize hover:bg-blue-500 transition-colors flex-shrink-0 ${
              isDragging ? 'bg-blue-500' : ''
            }`
          : `w-1 bg-gray-700 cursor-col-resize hover:bg-blue-500 transition-colors flex-shrink-0 ${
              isDragging ? 'bg-blue-500' : ''
            }`,
    },
  };
}
