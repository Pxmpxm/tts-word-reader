import { useId, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Upload } from "lucide-react"

interface FileUploaderProps {
  isLoading: boolean
  onFileUpload: (file: File) => void
}

export function FileUploader({ isLoading, onFileUpload }: FileUploaderProps) {
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    onFileUpload(file)
  }

  return (
    <>
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        className="hidden"
        accept=".doc,.docx,.pdf,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.jp2,.webp,.gif,.bmp,.txt,.md,.markdown"
        disabled={isLoading}
        onChange={handleFileChange}
      />
      <Button type="button" disabled={isLoading} onClick={() => fileInputRef.current?.click()} className="gap-2" aria-label={isLoading ? "正在处理文档" : "打开文档"}>
        <Upload className="h-4 w-4" />
        <span className="hidden sm:inline">{isLoading ? "处理中…" : "打开文档"}</span>
      </Button>
    </>
  )
}
