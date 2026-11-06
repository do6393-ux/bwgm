// 정보부 업무 카드의 "담당 파트". 카드(work_tasks 문서)의 part 필드에 id 가 저장된다.
// bar / dot 은 달력에서 파트를 구분하는 색 (Tailwind 가 찾을 수 있게 클래스 이름을 통째로 적어 둔다).
export const PARTS = [
  { id: "head", label: "부장", icon: "🧭", bar: "bg-sky-100 text-sky-900 border-sky-300", dot: "bg-sky-500" },
  { id: "plan", label: "정보기획", icon: "🗂️", bar: "bg-violet-100 text-violet-900 border-violet-300", dot: "bg-violet-500" },
  { id: "device", label: "정보화기기·소모품", icon: "💻", bar: "bg-amber-100 text-amber-900 border-amber-300", dot: "bg-amber-500" },
  { id: "nais", label: "나이스·정보공시", icon: "📊", bar: "bg-emerald-100 text-emerald-900 border-emerald-300", dot: "bg-emerald-500" },
  { id: "common", label: "공통", icon: "📌", bar: "bg-neutral-200 text-neutral-800 border-neutral-300", dot: "bg-neutral-500" },
];

export const DEFAULT_PART = "common";

/** part id 로 파트를 찾는다. 비어 있거나 모르는 값이면 "공통" (예전 카드·직접 고친 값이 화면에서 사라지지 않게). */
export function findPart(id) {
  return PARTS.find((p) => p.id === id) || PARTS.find((p) => p.id === DEFAULT_PART);
}
