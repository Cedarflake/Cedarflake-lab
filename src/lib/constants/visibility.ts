import type {Visibility} from "@/types";

export interface VisibilityMeta {
  label: string;
  description: string;
}

export const VISIBILITY_META: Record<Visibility, VisibilityMeta> = {
  public: {
    label: "公开",
    description: "任何访客都可以查看。",
  },
  authenticated: {
    label: "登录可见",
    description: "仅对已登录关系网开放，MVP 阶段只用于 Mock 标记。",
  },
  private: {
    label: "私密",
    description: "仅自己可见。",
  },
};
