import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText } from "lucide-react";

interface FileUploaderProps {
  isLoading: boolean;
  mammothLoaded: boolean;
  onFileUpload: (file: File) => void;
}

export function FileUploader({ isLoading, mammothLoaded, onFileUpload }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);

  // 处理文件上传
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      setFile(selectedFile);
      onFileUpload(selectedFile);
    }
  };

  return (
    <Card className="shadow-lg md:shadow-xl border border-gray-100 dark:border-gray-800 h-full">
      <CardContent className="pt-2 pb-2 md:pt-4 md:pb-4 lg:pt-6 lg:pb-6 flex flex-col h-full">
        <div className="flex flex-col items-center justify-center p-2 md:p-4 lg:p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 transition-colors duration-200 hover:border-blue-400 dark:hover:border-blue-600 flex-grow">
          <div className="p-2 md:p-3 lg:p-4 rounded-full bg-blue-100 dark:bg-blue-900 mb-2 md:mb-3 lg:mb-4">
            <Upload className="h-4 w-4 md:h-6 md:w-6 lg:h-8 lg:w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xs md:text-sm lg:text-base text-muted-foreground mb-2 md:mb-3 lg:mb-4">上传Word文档</p>
          <input type="file" id="file-upload" className="hidden" accept=".docx" onChange={handleFileChange} />
          <Button
            className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white px-3 md:px-4 lg:px-6 py-1 md:py-1.5 lg:py-2 text-xs md:text-sm lg:text-base"
            asChild
            disabled={isLoading || !mammothLoaded}
          >
            <label htmlFor="file-upload">
              {isLoading ? "处理中..." : !mammothLoaded ? "加载中..." : "选择文件"}
            </label>
          </Button>
          {file && (
            <div className="mt-2 md:mt-3 lg:mt-4 flex items-center p-1 md:p-2 lg:p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md w-full max-w-xs">
              <FileText className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5 mr-1 md:mr-2 lg:mr-3 text-blue-500" />
              <span className="text-xs md:text-sm lg:text-base truncate max-w-[150px]">{file.name}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 