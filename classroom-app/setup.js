// 교실 주소 넣는 창. 클립보드에 교실 주소가 있으면 미리 넣어 둔다.
const input = document.getElementById("url");
const msg = document.getElementById("msg");
const go = document.getElementById("go");

function say(text, kind) {
  msg.textContent = text;
  msg.className = `msg ${kind || ""}`;
}

window.setup.initial().then((init) => {
  if (!init) return;
  if (init.fromClipboard && init.fromClipboard !== init.current) {
    input.value = init.fromClipboard;
    say("복사해 둔 교실 주소를 넣어 두었어요.", "good");
  } else if (init.current) {
    input.value = init.current;
    say("지금 쓰는 주소예요.", "");
  }
  input.focus();
  input.select();
});

document.getElementById("form").addEventListener("submit", (event) => {
  event.preventDefault();
  go.disabled = true;
  say("", "");
  window.setup
    .save(input.value)
    .then((res) => {
      if (res && res.ok) return;
      say("교실 화면 주소가 아니에요. ?classroom= 이 들어간 주소를 넣어 주세요.", "bad");
      go.disabled = false;
    })
    .catch(() => {
      say("저장하지 못했어요. 다시 눌러 주세요.", "bad");
      go.disabled = false;
    });
});
