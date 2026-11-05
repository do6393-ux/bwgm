// 데이터를 불러오는 동안 보여 주는 자리 표시.
// 실제 항목과 같은 크기·모양(테두리, 간격)으로 짜 두면 데이터가 와도 화면이 밀리지 않는다.
// 색은 현재 탭 테마를 따른다 (index.css 의 .ui-skeleton).

/** 한 줄/한 덩어리. 크기는 className 으로 준다. 예) <Skeleton className="h-4 w-1/2" /> */
export function Skeleton({ className = "", style }) {
  return <div aria-hidden="true" style={style} className={`ui-skeleton rounded-sm ${className}`} />;
}

/**
 * 불러오는 영역 전체를 감싼다. 화면 낭독기에는 label 만 읽히고, 모양 조각들은 숨겨진다.
 * (role="status" 는 토스트가 쓰고 있어서 일부러 쓰지 않는다)
 */
export function SkeletonGroup({ label = "불러오는 중", className = "", children }) {
  return (
    <div aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
