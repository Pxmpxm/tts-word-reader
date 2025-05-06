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
    <Card className="shadow-md h-[calc(50%-12px)]">
      <CardContent className="pt-6 h-full flex flex-col">
        <div className="flex items-center mb-4">
          <Settings className="h-5 w-5 mr-2 text-blue-500" />
          <h3 className="font-medium">TTS设置</h3>
        </div>

        <div className="space-y-5 flex-grow">
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">语音</label>
            </div>
            <Select 
              value={selectedVoice}
              onValueChange={onVoiceChange}
            >
              <SelectTrigger className="border-gray-300 dark:border-gray-700">
                <SelectValue placeholder="选择语音" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              选择适合您的语音，更多高级设置请查看右侧"高级设置"标签页
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 