"use client"

import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Volume2, Sparkles, Trash2, HardDrive, Check, Loader2, Info } from "lucide-react"
import type { TTSStyleOption, Voice } from "@/lib/types"
import { cn } from "@/lib/utils"

interface SettingsPanelProps {
  voices: Voice[]
  styles: TTSStyleOption[]
  selectedVoice: string
  selectedStyle: string
  onVoiceChange: (voice: string) => void
  onStyleChange: (style: string) => void
  onClearCache?: () => Promise<void>
}

export function SettingsPanel({
  voices,
  styles,
  selectedVoice,
  selectedStyle,
  onVoiceChange,
  onStyleChange,
  onClearCache,
}: SettingsPanelProps) {
  const [clearing, setClearing] = useState(false)
  const [clearSuccess, setClearSuccess] = useState(false)

  const femaleVoices = voices.filter((v) => v.group === "female")
  const maleVoices = voices.filter((v) => v.group === "male")
  const currentVoiceObj = voices.find((v) => v.id === selectedVoice)

  const handleClearCache = async () => {
    if (!onClearCache) return
    setClearing(true)
    setClearSuccess(false)
    try {
      await onClearCache()
      setClearSuccess(true)
      setTimeout(() => setClearSuccess(false), 3000)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-6 text-foreground">
      {/* Voice selection section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Volume2 className="h-4 w-4 text-primary" />
            发音人选择
          </label>
          {currentVoiceObj && (
            <Badge variant="outline" className="text-[11px] font-normal border-primary/30 text-primary">
              {currentVoiceObj.group === "female" ? "女声" : "男声"}
            </Badge>
          )}
        </div>

        <Select value={selectedVoice} onValueChange={onVoiceChange}>
          <SelectTrigger className="h-10 rounded-xl border-input bg-background/80 px-3 text-sm focus:ring-primary/20">
            <SelectValue placeholder="选择朗读发音人" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {femaleVoices.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground font-semibold px-2 py-1.5">
                  女声播音员
                </SelectLabel>
                {femaleVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id} className="text-xs sm:text-sm py-2">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span>{voice.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {femaleVoices.length > 0 && maleVoices.length > 0 && <SelectSeparator />}
            {maleVoices.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-xs text-muted-foreground font-semibold px-2 py-1.5">
                  男声播音员
                </SelectLabel>
                {maleVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id} className="text-xs sm:text-sm py-2">
                    <div className="flex items-center justify-between w-full gap-2">
                      <span>{voice.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          更换发音人后，播放器将按新音色重新生成并缓冲后续语句。
        </p>
      </div>

      {/* Style selection section */}
      <div className="space-y-3">
        <label className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          朗读情感与风格
        </label>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {styles.map((style) => {
            const isSelected = style.id === selectedStyle
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => onStyleChange(style.id)}
                className={cn(
                  "flex items-center justify-center rounded-xl border p-2 text-xs font-medium transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                    : "border-border/80 bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {style.name}
              </button>
            )
          })}
        </div>
      </div>

      <div className="h-px bg-border/80" />

      {/* Cloud Audio Cache Management */}
      <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-xs font-semibold text-foreground">云端音频缓存存储</h4>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          已听过的句子音频会自动保存在私有云 Storage 中，再次播放时秒开免请求。如果需要释放空间或重新生成所有音频，可在此清空。
        </p>

        {onClearCache && (
          <Button
            variant="outline"
            size="sm"
            disabled={clearing}
            onClick={handleClearCache}
            className="w-full gap-2 rounded-xl text-xs h-9 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {clearing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                正在清理云端缓存…
              </>
            ) : clearSuccess ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                缓存已成功清空
              </>
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5" />
                清空云端音频缓存
              </>
            )}
          </Button>
        )}
      </div>

      {/* Account Info note */}
      <div className="flex items-start gap-2 rounded-xl bg-blue-50/60 p-3 text-[11px] text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>您的朗读进度、语速和选定的音色偏好均与您的账号自动双向同步。</span>
      </div>
    </div>
  )
}
