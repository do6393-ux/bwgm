import DOMPurify from "dompurify";

// target="_blank" 링크는 window.opener 접근을 끊어준다.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * Firestore 에 저장된 Quill HTML 을 화면에 그리기 전에 정화한다.
 * <script>, onerror= 같은 이벤트 속성, javascript: 링크 등을 제거하고
 * Quill 이 만드는 서식(색, 정렬, 목록, base64 이미지 등)은 그대로 둔다.
 */
export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || "", { ADD_ATTR: ["target"] });
}
