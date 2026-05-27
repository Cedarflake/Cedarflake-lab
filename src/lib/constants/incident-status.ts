import type {IncidentLifecycleStatus} from "@/types";

export interface IncidentStatusMeta {
  label: string;
  description: string;
}

export const INCIDENT_STATUS_META: Record<
  IncidentLifecycleStatus,
  IncidentStatusMeta
> = {
  scheduled: {
    label: "计划中",
    description: "已发布但尚未开始，常用于未来维护预告。",
  },
  investigating: {
    label: "持续中",
    description: "事件已开始，正在承受影响。",
  },
  identified: {
    label: "已确认",
    description: "原因已确认，正在组织恢复动作。",
  },
  monitoring: {
    label: "观察恢复",
    description: "状态正在回升，但仍需继续观察。",
  },
  resolved: {
    label: "已解决",
    description: "事件已手动收尾，不会再继续影响后续时间线。",
  },
};
