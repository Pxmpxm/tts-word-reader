import { Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { TTSStyleOption, Voice } from "@/lib/types";

interface SettingsPanelProps {
  voices: Voice[];
  styles: TTSStyleOption[];
  selectedVoice: string;
  selectedStyle: string;
  onVoiceChange: (voice: string) => void;
  onStyleChange: (style: string) => void;
}

export function SettingsPanel({
  voices,
  styles,
  selectedVoice,
  selectedStyle,
  onVoiceChange,
  onStyleChange
}: SettingsPanelProps) {
  const femaleVoices = voices.filter((voice) => voice.group === "female");
  const maleVoices = voices.filter((voice) => voice.group === "male");
  const ungroupedVoices = voices.filter((voice) => !voice.group);

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
                {femaleVoices.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>女声</SelectLabel>
                    {femaleVoices.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id} className="text-xs md:text-sm lg:text-base">
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {femaleVoices.length > 0 && maleVoices.length > 0 && <SelectSeparator />}
                {maleVoices.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>男声</SelectLabel>
                    {maleVoices.map((voice) => (
                      <SelectItem key={voice.id} value={voice.id} className="text-xs md:text-sm lg:text-base">
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {ungroupedVoices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id} className="text-xs md:text-sm lg:text-base">
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 md:space-y-2 lg:space-y-3">
            <div className="flex justify-between">
              <label className="text-xs md:text-sm lg:text-base font-medium">语音风格</label>
            </div>
            <Select
              value={selectedStyle}
              onValueChange={onStyleChange}
            >
              <SelectTrigger className="border-gray-300 dark:border-gray-700 text-xs md:text-sm lg:text-base h-7 md:h-9 lg:h-10">
                <SelectValue placeholder="选择风格" />
              </SelectTrigger>
              <SelectContent>
                {styles.map((style) => (
                  <SelectItem key={style.id} value={style.id} className="text-xs md:text-sm lg:text-base">
                    {style.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] md:text-xs lg:text-sm text-muted-foreground mt-1 md:mt-2">
              切换语音或风格会重新生成后续音频
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 
