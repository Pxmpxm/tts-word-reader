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
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 h-[calc(50%-12px)]">
      <CardContent className="pt-6 flex flex-col h-full">
        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 transition-colors duration-200 hover:border-blue-400 dark:hover:border-blue-600 flex-grow">
          <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900 mb-3">
            <Upload className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-sm text-muted-foreground mb-2">上传Word文档</p>
          <input type="file" id="file-upload" className="hidden" accept=".docx" onChange={handleFileChange} />
          <Button
            className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white"
            asChild
            disabled={isLoading || !mammothLoaded}
          >
            <label htmlFor="file-upload">
              {isLoading ? "处理中..." : !mammothLoaded ? "加载中..." : "选择文件"}
            </label>
          </Button>
          {file && (
            <div className="mt-4 flex items-center p-2 bg-blue-50 dark:bg-blue-900/30 rounded-md">
              <FileText className="h-4 w-4 mr-2 text-blue-500" />
              <span className="text-sm truncate max-w-[200px]">{file.name}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 