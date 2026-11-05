import { ArrowLeft } from "lucide-react";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

// 수업 자료·업무 상세 페이지가 데이터를 불러오는 동안(또는 문서를 찾지 못했을 때) 보여 주는 화면.
//   error: null = 불러오는 중 / "missing" = 없거나 삭제된 문서 / "error" = 읽기 실패(연결·권한)
// 문서가 없는데도 "불러오는 중"만 영원히 보이지 않도록 구분해 둔다.
export default function DetailPlaceholder({ error = null, className = "bg-white" }) {
  return (
    <div className={`min-h-screen ${className} text-black font-sans font-light pb-32`}>
      <header className="w-full border-b border-line px-8 py-6 flex justify-between items-center">
        <button onClick={() => window.close()} className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-widest hover:text-accent transition-colors">
          <ArrowLeft className="w-4 h-4" /> close window
        </button>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 pt-16 w-full">
        {error ? (
          <p role="alert" className="py-20 text-center font-mono text-[13px] uppercase tracking-widest opacity-60">
            {error === "missing" ? "존재하지 않거나 삭제된 페이지입니다." : "불러오지 못했습니다. 연결 상태를 확인해 주세요."}
          </p>
        ) : (
          <SkeletonGroup label="불러오는 중" className="space-y-12">
            <div className="space-y-4">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
            </div>
            <div className="space-y-3">
              {[100, 94, 97, 88, 60].map((w, i) => (
                <Skeleton key={i} className="h-4" style={{ width: `${w}%`, animationDelay: `-${i * 120}ms` }} />
              ))}
            </div>
          </SkeletonGroup>
        )}
      </main>
    </div>
  );
}
