import DOMPurify from "dompurify";
import { useRef, useEffect, useMemo } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FileText } from "lucide-react";

interface DocumentViewerProps {
  isLoading: boolean;
  html: string;
  fontSize: number;
  followReading: boolean;
}

export function DocumentViewer({ isLoading, html, fontSize, followReading }: DocumentViewerProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const sanitizedHtml = useMemo(() => {
    if (!html) return "";

    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["class"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    });
  }, [html]);

  // 当前句子变化时滚动到高亮位置
  useEffect(() => {
    if (followReading && documentRef.current) {
      const highlightedElement = documentRef.current.querySelector('.current-reading');
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    }
  }, [html, followReading]);

  return (
    <div className="h-full min-h-0 overflow-hidden rounded-lg bg-white dark:bg-gray-900">
      <ScrollArea className="h-full w-full px-4 py-3 sm:px-8 sm:py-6 lg:px-12">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-36 sm:h-48 space-y-2 sm:space-y-3 animate-pulse">
            <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-blue-500" />
            <p className="text-xs sm:text-sm text-muted-foreground">正在处理文档，请稍候...</p>
          </div>
        ) : sanitizedHtml ? (
          <div
            ref={documentRef}
            className="document-content mx-auto max-w-4xl pb-24 animate-in fade-in duration-300"
            style={{ fontSize: `${fontSize}%` }}
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-36 sm:h-48 text-muted-foreground space-y-2 sm:space-y-3 animate-in zoom-in duration-300">
            <FileText className="h-10 w-10 sm:h-12 sm:w-12 text-gray-300 dark:text-gray-600 transition-transform duration-300 hover:scale-110" />
            <div className="text-center max-w-md">
              <p className="text-sm sm:text-base font-medium text-gray-700 dark:text-gray-300 mb-1">打开一个文档开始阅读</p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                支持 Word、PDF、图片、Markdown 和纯文本
              </p>
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
} 
