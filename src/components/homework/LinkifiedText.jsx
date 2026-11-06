// 글 속의 http(s) 주소를 눌러서 열 수 있는 링크로 보여 준다. HTML 은 해석하지 않는다(글자 그대로).
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}])/g;

export default function LinkifiedText({ text, className = "" }) {
  const parts = String(text ?? "").split(URL_RE);
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="text-accent underline underline-offset-2 break-all">
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  );
}
