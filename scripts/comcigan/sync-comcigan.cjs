// 컴시간알리미 → Firestore(timetable_schedules) 동기화
// 2026-11 컴시간 사이트 개편으로 comcigan-parser 가 동작하지 않아 parse-comcigan 으로 교체.
// 저장하는 문서 모양(tt_class_*, tt_teacher_*, timetable_meta/sync_status)은 예전과 같다.
//
// 실행: GitHub Actions(.github/workflows/comcigan-sync.yml). 로컬에서는 이 폴더에서 npm install 후 npm run dry-run.
// DRY_RUN=1 이면 Firestore 에 쓰지 않고 가져온 내용만 출력한다.

const path = require('path');
const { pathToFileURL } = require('url');
const admin = require('firebase-admin');

const SCHOOL_NAME = '부원여자중학교';
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

// parse-comcigan 의 공개 API(timetable)는 빈 교시를 건너뛰어 교시 번호가 밀릴 수 있고,
// 학급마다 컴시간 페이지를 새로 받아 온다. 그래서 내부 로더(ComciganPage)를 직접 쓴다.
// 패키지가 이 파일을 공개하지 않으므로 워크플로에서 버전을 1.4.0 으로 고정해 둔다.
async function loadComciganPage() {
  const entry = require.resolve('parse-comcigan'); // .../dist/index.js
  const loaderUrl = pathToFileURL(path.join(path.dirname(entry), 'loader.js')).href;
  const { default: ComciganPage } = await import(loaderUrl);
  return ComciganPage.load();
}

// 컴시간이 그려 준 학급 시간표 HTML → rows[교시][요일] = { subject, teacher, changed } | null
function parseLessons(html, load) {
  const $ = load(html);
  return $('tr')
    .toArray()
    .filter((row) => $(row).children('td.교시').length && $(row).children('td').length === 6)
    .map((row, index) => {
      const cells = $(row).children('td').toArray();
      const periodNum = parseInt($(cells[0]).text(), 10);
      const days = cells.slice(1).map((cell) => {
        const parts = ($(cell).html() || '')
          .split(/<br\s*\/?\s*>/i)
          .map((part) => load(part).text().trim());
        if (parts.length < 2 || !parts[0]) return null;
        return {
          subject: parts[0].replace(/^[A-Z]_/, ''),
          teacher: parts[1] || '',
          changed: $(cell).hasClass('변경'),
        };
      });
      return { period: Number.isFinite(periodNum) ? periodNum : index + 1, days };
    });
}

// 한 주치 데이터 → { 학년: { 반: rows } }
function collectWeek(page, data, load) {
  const result = {};
  for (let grade = 1; grade < data.학급수.length; grade++) {
    const count = data.학급수[grade] - (data.가상학급수?.[grade] ?? 0);
    if (!(count > 0)) continue;
    result[grade] = {};
    for (let cls = 1; cls <= count; cls++) {
      result[grade][cls] = parseLessons(page.render(data, grade, cls), load);
    }
  }
  return result;
}

async function runSync() {
  console.log(`${SCHOOL_NAME} 컴시간알리미 수집 시작...${DRY_RUN ? ' (DRY_RUN: 저장 안 함)' : ''}`);

  const { load } = await import('cheerio');
  const page = await loadComciganPage();
  let school, resultThis, resultNext = null;
  try {
    const schools = await page.search(SCHOOL_NAME);
    school = schools.find((s) => s.name === SCHOOL_NAME) || schools[0];
    if (!school) throw new Error(`${SCHOOL_NAME} 검색 실패`);
    console.log(`학교: ${school.name} (${school.region}, 코드 ${school.code})`);

    // 컴시간 주차: 1 = 이번 주, 2 = 다음 주 (예전 코드의 _0_1 / _0_2 와 같다)
    resultThis = collectWeek(page, await page.data(school.code, 1), load);
    try {
      resultNext = collectWeek(page, await page.data(school.code, 2), load);
    } catch (e) {
      console.log('다음 주 데이터 아직 미등록 상태:', e.message);
    }
  } finally {
    page.dispose();
  }

  const writes = []; // [문서 ID, 데이터]
  let totalClassCount = 0;
  let totalLessonCount = 0;

  const processWeekData = (resultData, weekKey) => {
    if (!resultData) return;
    const teacherSchedules = {};

    for (const grade of Object.keys(resultData)) {
      for (const cls of Object.keys(resultData[grade])) {
        if (weekKey === 'this') totalClassCount++;
        const scheduleMap = {};

        for (const { period, days } of resultData[grade][cls]) {
          for (let day = 0; day < 5; day++) {
            const item = days[day];
            if (!item) continue; // 빈칸은 저장하지 않는다
            if (weekKey === 'this') totalLessonCount++;

            const teacherNameRaw = item.teacher.replace(/\*/g, '');
            const type = item.changed ? 'red' : 'normal';

            // 1. 학급 시간표
            scheduleMap[`${period}_${day}`] = {
              text: teacherNameRaw ? `${item.subject}${teacherNameRaw}` : item.subject,
              type,
            };

            // 2. 교사 시간표 (이름 앞 2글자를 키로, 1학년 10반 → 110)
            if (teacherNameRaw) {
              const tKey = teacherNameRaw.substring(0, 2);
              const classFormatted = `${grade}${String(cls).padStart(2, '0')}`;
              if (!teacherSchedules[tKey]) teacherSchedules[tKey] = {};
              teacherSchedules[tKey][`${period}_${day}`] = { text: `${classFormatted}${item.subject}`, type };
            }
          }
        }

        writes.push([`tt_class_${weekKey}_${grade}-${cls}`, {
          grade: Number(grade),
          classNum: Number(cls),
          schedule: scheduleMap,
        }]);
      }
    }

    for (const [tKey, tSchedule] of Object.entries(teacherSchedules)) {
      writes.push([`tt_teacher_${weekKey}_${tKey}`, { teacherCode: tKey, schedule: tSchedule }]);
      // 신정훈 선생님 32번 키 보장
      if (tKey === '신정') {
        writes.push([`tt_teacher_${weekKey}_32`, { teacherName: '신정훈', schedule: tSchedule }]);
      }
    }
  };

  processWeekData(resultThis, 'this');
  processWeekData(resultNext, 'next');

  // 컴시간 구조가 또 바뀌어 빈 시간표를 읽었을 때 기존 데이터를 지우지 않도록 멈춘다
  if (totalClassCount === 0 || totalLessonCount < totalClassCount * 10) {
    throw new Error(`가져온 시간표가 비정상입니다 (학급 ${totalClassCount}개, 수업 ${totalLessonCount}칸). 저장하지 않고 중단합니다.`);
  }

  const message = `[이번주${resultNext ? ' & 다음주' : ''}] 동기화 완료: 학급 ${totalClassCount}개, 수업 ${totalLessonCount}칸`;
  console.log(message);

  if (DRY_RUN) {
    const sample = writes.find(([id]) => id === 'tt_class_this_1-1');
    console.log('예시 tt_class_this_1-1:', JSON.stringify(sample?.[1].schedule, null, 1));
    console.log('교사 문서:', writes.filter(([id]) => id.startsWith('tt_teacher_this_')).map(([id]) => id).join(', '));
    console.log(`DRY_RUN 이라 문서 ${writes.length}개를 저장하지 않았습니다.`);
    return;
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 키 누락');
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const batch = db.batch();
  const updatedAt = admin.firestore.FieldValue.serverTimestamp();

  // merge 없이 덮어써서 지난 데이터가 남지 않게 한다
  for (const [id, data] of writes) {
    batch.set(db.collection('timetable_schedules').doc(id), { ...data, updatedAt });
  }
  batch.set(db.collection('timetable_meta').doc('sync_status'), {
    lastSyncedAt: new Date().toISOString(),
    status: 'SUCCESS',
    schoolName: school.name,
    message,
  });

  await batch.commit();
  console.log(`Firebase 저장 완료 (문서 ${writes.length + 1}개)`);
}

runSync().catch((err) => {
  console.error(err);
  if (err && err.cause) console.error('원인:', err.cause);
  process.exit(1);
});
