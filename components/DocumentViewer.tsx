import { useRef, useEffect, useState } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText } from "lucide-react";

interface DocumentViewerProps {
  isLoading: boolean;
  html: string;
  fontSize: number;
}

export function DocumentViewer({ isLoading, html, fontSize }: DocumentViewerProps) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  
  // 客户端加载检测
  useEffect(() => {
    setMounted(true);
    
    // 滚动到高亮的句子
    if (documentRef.current) {
      const highlightElement = documentRef.current.querySelector(".current-reading");
      if (highlightElement) {
        setTimeout(() => {
          highlightElement.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
          });
        }, 100);
      }
    }
  }, [html]);

  // 在服务器端渲染时不显示内容
  if (!mounted) {
    return (
      <div className="mt-4 border rounded-md bg-white dark:bg-gray-900 shadow-inner">
        <div className="h-[calc(100vh-350px)] w-full p-4 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 border rounded-md bg-white dark:bg-gray-900 shadow-inner">
      <ScrollArea className="h-[calc(100vh-350px)] w-full p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-32 space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <p>正在处理文档，请稍候...</p>
          </div>
        ) : html ? (
          <div
            ref={documentRef}
            className="document-content"
            style={{ fontSize: `${fontSize}%` }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground space-y-2">
            <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600" />
            <p>上传Word文档以查看内容</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
} 