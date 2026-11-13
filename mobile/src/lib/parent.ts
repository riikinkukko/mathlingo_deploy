/** Кабинет родителя в приложении: /api/m/parent. */
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface PHome {
  name: string;
  children: {
    id: string;
    name: string;
    solved: number;
    accuracy: number;
    activeDays7: number;
    hwOpen: number;
    hwOverdue: number;
    nextLesson: { startsAt: string; durationMin: number } | null;
  }[];
  telegram: boolean;
  weeklyReport: boolean;
}

export interface PChild {
  child: { id: string; name: string; targetScore: number | null };
  teacher: { name: string } | null;
  stats: { solved: number; accuracy: number; activeDays7: number };
  weekly: { week: string; solved: number; accuracy: number | null }[];
  mocks: { id: string; score: number; takenAt: string }[];
  upcoming: { id: string; startsAt: string; durationMin: number; topic: string | null; group: string | null }[];
  homeworks: { id: string; title: string; kind: string; dueDate: string; done: number; total: number; overdue: boolean; complete: boolean }[];
  logs: { id: string; date: string; topic: string; report: string }[];
  balance: { title: string; sub: string; debt: boolean } | null;
  topics: { id: string; title: string; solved: number; total: number }[];
}

export const useParentHome = () => useQuery({ queryKey: ["p", "home"], queryFn: () => api<PHome>("/api/m/parent") });
export const useParentChild = (id: string | undefined) =>
  useQuery({ queryKey: ["p", "child", id], queryFn: () => api<PChild>(`/api/m/parent?view=child&id=${encodeURIComponent(id ?? "")}`), enabled: !!id });
