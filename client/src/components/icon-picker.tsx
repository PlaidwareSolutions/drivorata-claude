import { useState } from "react";
import {
  Car,
  Shield,
  Clock,
  Star,
  Trophy,
  GraduationCap,
  Users,
  MapPin,
  Phone,
  Mail,
  Calendar,
  CheckCircle,
  Heart,
  Zap,
  Target,
  Award,
  BookOpen,
  ThumbsUp,
  Smile,
  Eye,
  Lock,
  Globe,
  Headphones,
  MessageCircle,
  DollarSign,
  CreditCard,
  Briefcase,
  Building,
  Home,
  Navigation,
  Compass,
  Flag,
  Lightbulb,
  Wrench,
  Settings,
  TrendingUp,
  BarChart,
  PieChart,
  Activity,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const iconMap: Record<string, LucideIcon> = {
  car: Car,
  shield: Shield,
  clock: Clock,
  star: Star,
  trophy: Trophy,
  "graduation-cap": GraduationCap,
  users: Users,
  "map-pin": MapPin,
  phone: Phone,
  mail: Mail,
  calendar: Calendar,
  "check-circle": CheckCircle,
  heart: Heart,
  zap: Zap,
  target: Target,
  award: Award,
  "book-open": BookOpen,
  "thumbs-up": ThumbsUp,
  smile: Smile,
  eye: Eye,
  lock: Lock,
  globe: Globe,
  headphones: Headphones,
  "message-circle": MessageCircle,
  "dollar-sign": DollarSign,
  "credit-card": CreditCard,
  briefcase: Briefcase,
  building: Building,
  home: Home,
  navigation: Navigation,
  compass: Compass,
  flag: Flag,
  lightbulb: Lightbulb,
  wrench: Wrench,
  settings: Settings,
  "trending-up": TrendingUp,
  "bar-chart": BarChart,
  "pie-chart": PieChart,
  activity: Activity,
  wifi: Wifi,
};

const iconLabels: Record<string, string> = {
  car: "Car",
  shield: "Shield",
  clock: "Clock",
  star: "Star",
  trophy: "Trophy",
  "graduation-cap": "Graduation",
  users: "Users",
  "map-pin": "Map Pin",
  phone: "Phone",
  mail: "Mail",
  calendar: "Calendar",
  "check-circle": "Check",
  heart: "Heart",
  zap: "Zap",
  target: "Target",
  award: "Award",
  "book-open": "Book",
  "thumbs-up": "Thumbs Up",
  smile: "Smile",
  eye: "Eye",
  lock: "Lock",
  globe: "Globe",
  headphones: "Headphones",
  "message-circle": "Message",
  "dollar-sign": "Dollar",
  "credit-card": "Credit Card",
  briefcase: "Briefcase",
  building: "Building",
  home: "Home",
  navigation: "Navigation",
  compass: "Compass",
  flag: "Flag",
  lightbulb: "Lightbulb",
  wrench: "Wrench",
  settings: "Settings",
  "trending-up": "Trending",
  "bar-chart": "Bar Chart",
  "pie-chart": "Pie Chart",
  activity: "Activity",
  wifi: "Wifi",
};

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  "data-testid"?: string;
}

export function IconPicker({ value, onChange, "data-testid": testId }: IconPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const SelectedIcon = value ? iconMap[value] : null;

  const filteredIcons = Object.entries(iconMap).filter(([key]) => {
    if (!search) return true;
    const label = iconLabels[key] || key;
    return key.toLowerCase().includes(search.toLowerCase()) || label.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 h-8"
          data-testid={testId}
        >
          {SelectedIcon ? (
            <>
              <SelectedIcon className="h-4 w-4" />
              <span className="text-xs">{iconLabels[value] || value}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Pick icon</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons..."
          className="mb-2 h-8 text-sm"
          data-testid="icon-picker-search"
        />
        <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
          {filteredIcons.map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              className={`p-1.5 rounded hover:bg-muted flex items-center justify-center ${value === key ? "bg-primary/10 ring-1 ring-primary" : ""}`}
              onClick={() => {
                onChange(key);
                setOpen(false);
                setSearch("");
              }}
              title={iconLabels[key] || key}
              data-testid={`icon-option-${key}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full mt-1 h-7 text-xs"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            data-testid="icon-picker-clear"
          >
            Clear icon
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function RenderIcon({ name, className, style }: { name: string; className?: string; style?: any }) {
  const Icon = iconMap[name];
  if (!Icon) return null;
  return <Icon className={className} style={style} />;
}
