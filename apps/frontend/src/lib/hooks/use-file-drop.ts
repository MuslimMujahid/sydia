import { useRef, useState, type DragEvent, type DragEventHandler } from "react";

type FileDropOptions = {
  disabled: boolean;
  onFiles: (files: File[]) => void;
};

function isInsideDropZone(event: DragEvent<HTMLElement>) {
  return (
    event.target instanceof Node && event.currentTarget.contains(event.target)
  );
}

function isFileDrag(event: DragEvent<HTMLElement>) {
  return isInsideDropZone(event) && event.dataTransfer.types.includes("Files");
}

export function useFileDrop({ disabled, onFiles }: FileDropOptions) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  function resetDrag() {
    depth.current = 0;
    setDragging(false);
  }

  const onDragEnterCapture: DragEventHandler<HTMLElement> = (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    // Moving between descendants enters the next one before leaving the last.
    depth.current += 1;
    if (depth.current === 1) setDragging(true);
  };

  const onDragLeaveCapture: DragEventHandler<HTMLElement> = (event) => {
    if (depth.current === 0 || !isInsideDropZone(event)) return;
    depth.current -= 1;
    if (depth.current === 0) resetDrag();
  };

  const onDragOverCapture: DragEventHandler<HTMLElement> = (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  };

  const onDropCapture: DragEventHandler<HTMLElement> = (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    resetDrag();
    if (disabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  };

  return {
    isDraggingFiles: dragging && !disabled,
    fileDropProps: {
      onDragEnterCapture,
      onDragLeaveCapture,
      onDragOverCapture,
      onDropCapture,
    },
  };
}
