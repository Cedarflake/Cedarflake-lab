import type {IncidentSeverity} from "@/types";

export type SeverityIconName =
  | "CircleCheckBig"
  | "Wrench"
  | "BatteryWarning"
  | "TriangleAlert"
  | "OctagonX";

export interface SeverityMeta {
  level: number;
  label: string;
  iconName: SeverityIconName;
  colorToken: string;
  affectsUptime: boolean;
  description: string;
}

export const SEVERITY_META: Record<IncidentSeverity, SeverityMeta> = {
  normal: {
    level: 0,
    label: "平稳运行",
    iconName: "CircleCheckBig",
    colorToken: "emerald",
    affectsUptime: false,
    description: "状态绝佳，一切顺利，适合记录日常碎片。",
  },
  maintenance: {
    level: 1,
    label: "专注休整",
    iconName: "Wrench",
    colorToken: "sky",
    affectsUptime: false,
    description: "计划内调整、免打扰或专注模式，不计入故障时长。",
  },
  notice: {
    level: 2,
    label: "轻微掉线",
    iconName: "BatteryWarning",
    colorToken: "amber",
    affectsUptime: true,
    description: "轻微疲惫、小烦恼或电量不足，开始影响日常节奏。",
  },
  warning: {
    level: 3,
    label: "状态预警",
    iconName: "TriangleAlert",
    colorToken: "orange",
    affectsUptime: true,
    description: "明显身体不适或情绪低落，需要主动休息与恢复。",
  },
  critical: {
    level: 4,
    label: "强制关机",
    iconName: "OctagonX",
    colorToken: "rose",
    affectsUptime: true,
    description: "极度虚弱或生病，进入完全离线躺平模式。",
  },
};

export const SEVERITY_ORDER: IncidentSeverity[] = [
  "normal",
  "maintenance",
  "notice",
  "warning",
  "critical",
];
