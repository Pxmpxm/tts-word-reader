import { Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Voice } from "@/lib/types";

interface SettingsPanelProps {
  voices: Voice[];
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
}

export function SettingsPanel({
  voices,
  selectedVoice,
  onVoiceChange
}: SettingsPanelProps) {
  return (
    <Card className="shadow-lg md:shadow-xl border border-gray-100 dark:border-gray-800 h-full">
      <CardContent className="pt-2 pb-2 md:pt-4 md:pb-4 lg:pt-6 lg:pb-6 h-full flex flex-col">
        <div className="flex items-center mb-1 md:mb-3 lg:mb-4">
          <div className="p-1 md:p-2 lg:p-3 rounded-full bg-blue-100 dark:bg-blue-900 mr-1 md:mr-2 lg:mr-3">
            <Settings className="h-3 w-3 md:h-4 md:w-4 lg:h-5 lg:w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="font-medium text-xs md:text-base lg:text-lg">TTS设置</h3>
        </div>

        <div className="space-y-2 md:space-y-3 lg:space-y-4 flex-grow">
          <div className="space-y-1 md:space-y-2 lg:space-y-3">
            <div className="flex justify-between">
              <label className="text-xs md:text-sm lg:text-base font-medium">语音</label>
            </div>
            <Select 
              value={selectedVoice}
              onValueChange={onVoiceChange}
            >
              <SelectTrigger className="border-gray-300 dark:border-gray-700 text-xs md:text-sm lg:text-base h-7 md:h-9 lg:h-10">
                <SelectValue placeholder="选择语音" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id} className="text-xs md:text-sm lg:text-base">
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] md:text-xs lg:text-sm text-muted-foreground mt-1 md:mt-2">
              选择适合您的语音，更多设置请查看右侧标签页
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 