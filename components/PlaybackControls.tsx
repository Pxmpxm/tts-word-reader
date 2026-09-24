"use client"

import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Gauge,
  Loader2,
  LocateFixed,
  Volume2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface PlaybackControlsProps {
  isPlaying: boolean
  isLoading: boolean
  currentIndex: number
  totalCount: number
  playbackRate: number
  hasPrevious: boolean
  hasNext: boolean
  onTogglePlay: () => void
  onPrevious: () => void
  onNext: () => void
  onPlaybackRateChange: (rate: number) => void
  onProgressChange: (index: number) => void
  voiceName?: string
  onOpenSettings?: () => void
  followReading?: boolean
  onToggleFollowReading?: () => void
}

const SPEED_PRESETS = [0.8, 1.0, 1.2, 1.5, 2.0]

export function PlaybackControls({
  isPlaying,
  isLoading,
  currentIndex,
  totalCount,
  playbackRate,
  hasPrevious,
  hasNext,
  onTogglePlay,
  onPrevious,
  onNext,
  onPlaybackRateChange,
  onProgressChange,
  voiceName,
  onOpenSettings,
  followReading,
  onToggleFollowReading,
}: PlaybackControlsProps) {
  const [sliderValue, setSliderValue] = useState<number>(playbackRate * 10)
  const progressPercentage = totalCount > 1
    ? Math.max(0, (currentIndex / (totalCount - 1)) * 100)
    : 0
  const [seekValue, setSeekValue] = useState(progressPercentage)

  useEffect(() => {
    setSliderValue(playbackRate * 10)
  }, [playbackRate])

  useEffect(() => {
    setSeekValue(progressPercentage)
  }, [progressPercentage])

  const handleSpeedSliderChange = (value: number[]) => {
    setSliderValue(value[0])
    const newRate = parseFloat((value[0] / 10).toFixed(1))
    onPlaybackRateChange(newRate)
  }

  const handleProgressCommit = (value: number[]) => {
    if (totalCount <= 0) return
    const newIndex = Math.round((value[0] / 100) * (totalCount - 1))
    onProgressChange(newIndex)
  }

  return (
    <div className="glass-dock relative z-20 w-full border-t bg-card/90 px-3 py-2.5 backdrop-blur-xl sm:px-6 sm:py-3.5">
      {/* Top interactive progress scrubber */}
      <div className="group relative -top-3 left-0 right-0 -mb-2 px-1">
        <Slider
          value={[seekValue]}
          disabled={totalCount <= 1}
          onValueChange={(val) => setSeekValue(val[0])}
          onValueCommit={handleProgressCommit}
          className="h-1.5 cursor-pointer py-1 transition-all group-hover:h-2"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* Left info: sentence progress & live equalizer */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Animated audio wave equalizer */}
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            {isPlaying ? (
              <div className="flex items-end gap-0.5 h-4">
                <span className="w-0.5 rounded-full bg-primary animate-wave-1" />
                <span className="w-0.5 rounded-full bg-primary animate-wave-2" />
                <span className="w-0.5 rounded-full bg-primary animate-wave-3" />
              </div>
            ) : (
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
              {totalCount > 0 ? `第 ${currentIndex + 1} / ${totalCount} 句` : "未加载句子"}
            </span>
            <span className="text-[11px] text-muted-foreground font-medium shrink-0">
              {Math.round(progressPercentage)}%
            </span>
          </div>

          {onToggleFollowReading && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleFollowReading}
                    className={cn(
                      "h-7 w-7 rounded-lg transition-colors ml-1 hidden sm:inline-flex",
                      followReading
                        ? "text-primary bg-primary/10 hover:bg-primary/20"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-label="跟随朗读滚动"
                  >
                    <LocateFixed className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{followReading ? "关闭视图跟随" : "开启视图跟随"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Center: Core Playback Buttons */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 order-first sm:order-none">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onPrevious}
                  disabled={!hasPrevious}
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border-border/80 bg-background/80 shadow-sm transition-all hover:bg-accent hover:scale-105 active:scale-95 disabled:opacity-40"
                  aria-label="上一句"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>上一句 (←)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={onTogglePlay}
                  disabled={totalCount === 0}
                  className={cn(
                    "relative h-12 w-12 sm:h-13 sm:w-13 rounded-full text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50",
                    isPlaying
                      ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-500/30 hover:from-amber-600 hover:to-orange-700 ring-2 ring-orange-400/30"
                      : "bg-gradient-to-br from-primary to-blue-600 shadow-primary/30 hover:from-primary/90 hover:to-blue-700"
                  )}
                  aria-label={isPlaying ? "暂停" : "播放"}
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="h-5 w-5 fill-current" />
                  ) : (
                    <Play className="h-5 w-5 ml-0.5 fill-current" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>{isPlaying ? "暂停 (空格)" : "播放 (空格)"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onNext}
                  disabled={!hasNext}
                  className="h-9 w-9 sm:h-10 sm:w-10 rounded-full border-border/80 bg-background/80 shadow-sm transition-all hover:bg-accent hover:scale-105 active:scale-95 disabled:opacity-40"
                  aria-label="下一句"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>下一句 (→)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Right Section: Rate Popover & Voice info */}
        <div className="flex items-center justify-end gap-2 shrink-0">
          {/* Playback rate popover with quick buttons & slider */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-full px-2.5 text-xs font-semibold border-border/80 bg-background/80 hover:bg-accent shadow-sm"
              >
                <Gauge className="h-3.5 w-3.5 text-primary" />
                <span>{playbackRate.toFixed(1)}x</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-64 p-3 space-y-3">
              <div className="flex items-center justify-between text-xs font-medium text-foreground">
                <span>朗读语速</span>
                <span className="font-semibold text-primary">{playbackRate.toFixed(1)}x</span>
              </div>

              {/* Speed presets */}
              <div className="flex items-center justify-between gap-1">
                {SPEED_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSliderValue(preset * 10)
                      onPlaybackRateChange(preset)
                    }}
                    className={cn(
                      "flex-1 py-1 rounded-md text-[11px] font-medium transition-colors",
                      Math.abs(playbackRate - preset) < 0.05
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-secondary text-secondary-foreground hover:bg-accent"
                    )}
                  >
                    {preset}x
                  </button>
                ))}
              </div>

              {/* Fine Slider */}
              <div className="pt-1">
                <Slider
                  value={[sliderValue]}
                  min={5}
                  max={25}
                  step={1}
                  onValueChange={handleSpeedSliderChange}
                  className="cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span>0.5x 慢速</span>
                  <span>1.0x 正常</span>
                  <span>2.5x 极速</span>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Voice Indicator button (clicking triggers settings) */}
          {voiceName && onOpenSettings && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              className="h-8 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:text-foreground hidden md:inline-flex"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate max-w-[80px]">{voiceName}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
