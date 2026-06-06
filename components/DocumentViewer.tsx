import DOMPurify from "dompurify";
import { useRef, useEffect, useMemo } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText } from "lucide-react";

interface DocumentViewerProps {
  isLoading: boolean;
  html: string;
  fontSize: number;
}

export function DocumentViewer({ isLoading, html, fontSize }: DocumentViewerProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const sanitizedHtml = useMemo(() => {
    if (!html) return "";

    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["class"],
    });
  }, [html]);

  // 当前句子变化时滚动到高亮位置
  useEffect(() => {
    if (documentRef.current) {
      const highlightedElement = documentRef.current.querySelector('.current-reading');
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    }
  }, [html]);

  return (
    <div className="mt-1 sm:mt-2 border rounded-lg bg-white dark:bg-gray-900 shadow-inner h-full overflow-hidden transition-all duration-300">
      <ScrollArea className="h-[calc(100vh-200px)] sm:h-[calc(100vh-220px)] w-full p-2 sm:p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-36 sm:h-48 space-y-2 sm:space-y-3 animate-pulse">
            <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-blue-500" />
            <p className="text-xs sm:text-sm text-muted-foreground">正在处理文档，请稍候...</p>
          </div>
        ) : sanitizedHtml ? (
          <div
            ref={documentRef}
            className="document-content pr-1 sm:pr-2 pb-2 sm:pb-4 animate-in fade-in slide-in-from-bottom-2 duration-500"
            style={{ fontSize: `${fontSize}%` }}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-36 sm:h-48 text-muted-foreground space-y-2 sm:space-y-3 animate-in zoom-in duration-300">
            <FileText className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 transition-transform duration-300 hover:scale-110" />
            <div className="text-center max-w-md">
              <p className="text-sm sm:text-base font-medium text-gray-700 dark:text-gray-300 mb-1">请上传Word文档</p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                上传文档后，您可以在此预览内容并使用TTS朗读
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
} 
