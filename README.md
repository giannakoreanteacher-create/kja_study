# 한국어 단어 카드

한국어 학습용 어휘 목록(A/B/C 3단계, 총 5,965단어)을 랜덤 순서 플래시카드로 학습하는 사이트.

## 로컬 실행

```bash
npm install
npm start
```

`http://localhost:5000` 에서 확인.

## 배포 (Render)

1. 이 저장소를 GitHub에 push
2. Render 대시보드 → New → Web Service → 이 GitHub 저장소 선택
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Render가 자동으로 `PORT` 환경변수를 주입하며, `server.js`가 이를 사용하도록 되어 있음
6. 무료 티어는 일정 시간 무활동 시 슬립되어 첫 요청 시 기동에 시간이 걸릴 수 있음
