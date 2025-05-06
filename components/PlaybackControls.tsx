import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Play, Pause, SkipBack, SkipForward, Gauge } from "lucide-react";
import { savePlaybackRate } from "@/lib/playbackController";

interface PlaybackControlsProps {
  isPlaying: boolean;
  isLoading: boolean;
  currentIndex: number;
  totalCount: number;
  playbackRate: number;
  hasPrevious: boolean;
  hasNext: boolean;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onProgressChange: (index: number) => void;
}

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
  onProgressChange
}: PlaybackControlsProps) {
  
  // 处理播放速率变化
  const handlePlaybackRateChange = (value: number[]) => {
    // 转换为小数并保留一位小数
    const newRate = parseFloat((value[0] / 10).toFixed(1));
    
    // 保存到localStorage并更新状态
    savePlaybackRate(newRate);
    onPlaybackRateChange(newRate);
  };
  
  // 处理进度条变化
  const handleProgressChange = (value: number[]) => {
    // 转换进度百分比为索引
    const newIndex = Math.round((value[0] / 100) * (totalCount - 1));
    onProgressChange(newIndex);
  };
  
  // 计算当前进度百分比
  const progressPercentage = totalCount > 1 
    ? Math.max(0, (currentIndex / Math.max(1, totalCount - 1)) * 100)
    : 0;

  return (
    <div className="p-6 border-t mt-4 bg-gray-50 dark:bg-gray-800 rounded-b-lg">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 播放控制按钮组 */}
        <div className="flex items-center space-x-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onPrevious}
                  disabled={!hasPrevious || isLoading}
                  className="border-gray-300 dark:border-gray-700"
                >
                  <SkipBack className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>上一句</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  onClick={onTogglePlay}
                  disabled={totalCount === 0 || isLoading}
                  className={`bg-gradient-to-r ${
                    isPlaying
                      ? "from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
                      : "from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600"
                  } text-white relative`}
                >
                  {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                    </div>
                  ) : (
                    isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isPlaying ? "暂停" : "播放"}</p>
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
                  disabled={!hasNext || isLoading}
                  className="border-gray-300 dark:border-gray-700"
                >
                  <SkipForward className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>下一句</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* 播放速率控制 */}
        <div className="flex items-center gap-4 flex-1 max-w-xl">
          <div className="flex items-center gap-2 flex-1">
            <Gauge className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Slider 
              value={[playbackRate * 10]} 
              min={5} 
              max={20} 
              step={1} 
              className="flex-1 cursor-pointer"
              onValueChange={handlePlaybackRateChange}
            />
            <span className="text-xs text-muted-foreground w-9 text-right">{playbackRate.toFixed(1)}x</span>
          </div>
        </div>

        {/* 进度指示器 */}
        <div className="text-sm font-medium bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full shrink-0">
          {totalCount > 0 ? `${currentIndex + 1} / ${totalCount}` : "0 / 0"}
        </div>
      </div>

      <div className="mt-4">
        <Slider
          value={[progressPercentage]}
          disabled={totalCount <= 1 || isLoading}
          onValueChange={handleProgressChange}
          className="cursor-pointer"
        />
        
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>进度: {Math.round(progressPercentage)}%</span>
          <span>句子: {currentIndex + 1} / {totalCount}</span>
        </div>
      </div>
    </div>
  );
} 