import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Play, Pause, SkipBack, SkipForward, Gauge } from "lucide-react";
import { useEffect, useState } from "react";

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
  errorMessage?: string;
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
  onProgressChange,
  errorMessage
}: PlaybackControlsProps) {
  
  // 创建本地状态跟踪滑块值
  const [sliderValue, setSliderValue] = useState<number>(playbackRate * 10);
  
  // 同步外部playbackRate到本地状态
  useEffect(() => {
    setSliderValue(playbackRate * 10);
  }, [playbackRate]);
  
  // 处理播放速率变化
  const handlePlaybackRateChange = (value: number[]) => {
    // 更新本地滑块状态
    setSliderValue(value[0]);
    
    // 转换为小数并保留一位小数
    const newRate = parseFloat((value[0] / 10).toFixed(1));
    
    // 通知父组件更新速率
    onPlaybackRateChange(newRate);
  };
  
  // 处理播放/暂停按钮点击
  const handleTogglePlay = () => {
    onTogglePlay();
  };
  
  // 处理进度条变化
  const handleProgressChange = (value: number[]) => {
    if (totalCount <= 0) return;

    // 转换进度百分比为索引
    const newIndex = Math.round((value[0] / 100) * (totalCount - 1));
    onProgressChange(newIndex);
  };
  
  // 计算当前进度百分比
  const progressPercentage = totalCount > 1 
    ? Math.max(0, (currentIndex / Math.max(1, totalCount - 1)) * 100)
    : 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-b-lg space-y-2 p-2 sm:space-y-3 sm:p-3 md:space-y-4 md:p-4 lg:space-y-5 lg:p-5">
      <div className="grid grid-cols-2 md:flex md:flex-wrap items-center justify-between gap-2 md:gap-3 lg:gap-4">
        {/* 播放控制按钮组 */}
        <div className="flex items-center space-x-1 sm:space-x-2 md:space-x-3 lg:space-x-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
	                  size="icon"
	                  onClick={onPrevious}
	                  disabled={!hasPrevious}
                    aria-label="上一句"
	                  className="border-gray-300 dark:border-gray-700 w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full transition-all duration-300 hover:scale-105 active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-800"
	                >
                  <SkipBack className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 lg:h-6 lg:w-6" />
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
	                  onClick={handleTogglePlay}
	                  disabled={totalCount === 0}
                    aria-label={isLoading ? "取消加载" : isPlaying ? "暂停" : "播放"}
	                  className={`bg-gradient-to-r ${
                    isPlaying
                      ? "from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 shadow-orange-500/40"
                      : "from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 shadow-blue-500/40"
                  } text-white relative w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-full shadow-lg transition-all duration-300 hover:scale-105 active:scale-95`}
                >
                  {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="animate-spin h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 border-2 border-white rounded-full border-t-transparent"></div>
                    </div>
                  ) : (
                    isPlaying ? 
                      <Pause className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 lg:h-6 lg:w-6" /> : 
                      <Play className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 lg:h-6 lg:w-6 ml-0.5" />
                  )}
                </Button>
              </TooltipTrigger>
	              <TooltipContent>
	                <p>{isLoading ? "取消加载" : isPlaying ? "暂停" : "播放"}</p>
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
                    aria-label="下一句"
	                  className="border-gray-300 dark:border-gray-700 w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full transition-all duration-300 hover:scale-105 active:scale-95 hover:bg-gray-100 dark:hover:bg-gray-800"
	                >
                  <SkipForward className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 lg:h-6 lg:w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>下一句</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* 进度指示器 - 在小屏幕上显示在右侧 */}
        <div className="text-[10px] sm:text-xs md:text-sm lg:text-base font-medium bg-gray-100 dark:bg-gray-800 px-1.5 sm:px-2 md:px-3 lg:px-4 py-0.5 sm:py-1 md:py-1.5 lg:py-2 rounded-full shrink-0 text-center md:order-3">
          {totalCount > 0 ? `${currentIndex + 1} / ${totalCount}` : "0 / 0"}
        </div>

        {/* 播放速率控制 - 在小屏幕上占据整行 */}
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 lg:gap-4 flex-1 col-span-2 mt-1 md:mt-0 md:col-span-1 md:order-2 md:max-w-md">
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 flex-1">
            <Gauge className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
            <Slider 
              value={[sliderValue]} 
              min={5} 
              max={20} 
              step={1} 
              className="flex-1 cursor-pointer md:h-2 lg:h-3"
              onValueChange={handlePlaybackRateChange}
            />
            <span className="text-[10px] sm:text-xs md:text-sm lg:text-base font-medium w-8 sm:w-10 md:w-12 lg:w-14 text-right bg-gray-100 dark:bg-gray-800 px-1 sm:px-1.5 md:px-2 lg:px-3 py-0.5 md:py-1 lg:py-1.5 rounded-md">{playbackRate.toFixed(1)}x</span>
          </div>
        </div>
      </div>

      <div>
	        <Slider
	          value={[progressPercentage]}
	          disabled={totalCount <= 1}
	          onValueChange={handleProgressChange}
	          className="cursor-pointer h-1.5 md:h-2 lg:h-3"
	        />
        
	        <div className="flex justify-between text-[10px] sm:text-xs md:text-sm text-muted-foreground mt-1 md:mt-2 lg:mt-3">
	          <span>进度: {Math.round(progressPercentage)}%</span>
	          <span>句子: {totalCount > 0 ? currentIndex + 1 : 0} / {totalCount}</span>
	        </div>
          {errorMessage && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {errorMessage}
            </p>
          )}
	      </div>
    </div>
  );
} 
