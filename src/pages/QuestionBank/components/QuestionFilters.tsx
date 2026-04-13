import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FilterX } from "lucide-react";
import { INDUSTRIES, LANGUAGES } from "../data";

interface QuestionFiltersProps {
  difficulty: string;
  setDifficulty: (value: string) => void;
  industry: string;
  setIndustry: (value: string) => void;
  language: string;
  setLanguage: (value: string) => void;
  onClear: () => void;
}

export const QuestionFilters = ({
  difficulty,
  setDifficulty,
  industry,
  setIndustry,
  language,
  setLanguage,
  onClear,
}: QuestionFiltersProps) => {
  const isFiltered = difficulty !== "all" || industry !== "all" || language !== "all";

  return (
    <div className="flex items-center gap-3 ml-2">
      <Select value={difficulty} onValueChange={setDifficulty}>
        <SelectTrigger className="w-27.5" size="sm">
          <SelectValue placeholder="Rank" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Ranks</SelectItem>
          <SelectItem value="Easy">Easy</SelectItem>
          <SelectItem value="Medium">Medium</SelectItem>
          <SelectItem value="Hard">Hard</SelectItem>
        </SelectContent>
      </Select>

      <Select value={industry} onValueChange={setIndustry}>
        <SelectTrigger className="w-32.5" size="sm">
          <SelectValue placeholder="Industry" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Industries</SelectItem>
          {INDUSTRIES.map((ind) => (
            <SelectItem key={ind} value={ind}>
              {ind}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={language} onValueChange={setLanguage}>
        <SelectTrigger className="w-30" size="sm">
          <SelectValue placeholder="Language" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Languages</SelectItem>
          {LANGUAGES.map((lang) => (
            <SelectItem key={lang} value={lang}>
              {lang}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-gray-500 hover:text-red-600 h-8 px-2"
        >
          <FilterX className="w-4 h-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
};
