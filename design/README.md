# 나눔교실 웹 디자인 제안 01

macOS 작업 도구의 정돈된 구조와 선명한 글자를 바탕으로 한 웹용 디자인 제안입니다.
규격은 이 서비스에 맞춰 정한 값이며 Apple의 공식 고정 규격을 뜻하지 않습니다.

## 열어보기

프로젝트 폴더에서 `PORT=4174 npm run dev`를 실행한 뒤 다음 주소를 엽니다.

- 검토 화면: `http://127.0.0.1:4174/design/index.html`
- 입력 화면: `http://127.0.0.1:4174/design/input.html`
- 공통 규칙: `http://127.0.0.1:4174/design/index.html#system`

입력 화면은 기존 app.js와 배정 코드를 사용하고 디자인 스타일만 덧붙입니다.
이 검토 파일들은 현재 배포 파일 목록에 포함하지 않습니다.
4174 포트를 사용하면 기존 로컬 미리보기와 저장 영역이 구분되며, 공개 사이트의 명단을 읽지 않습니다.
가상 명단은 제공하지 않고 빈 입력 화면으로 시작합니다.

## 공통 규칙

### 색상과 글자

- 시스템 글꼴: macOS의 기본 글꼴을 우선 사용하고 Windows에서는 해당 기기의 글꼴을 사용합니다.
- 화면 제목: 26px, 굵기 650. 영역 제목: 16px, 굵기 600.
- 본문과 입력: 14px. 도움말: 12px.
- 작업 배경: #F5F5F7. 내용 영역: #FFFFFF.
- 본문: #1D1D1F. 보조 글자: #616166.
- 주요 동작: #0066D6. 선택 배경: #E8F0FC.
- 성공·경고·오류에는 각각 문구와 표시를 함께 사용합니다.

### 간격과 부품

- 간격: 4, 8, 12, 16, 24, 32px를 기준으로 반복합니다.
- 기본 버튼·입력 높이: 36px. 주요 버튼: 40px. 터치 환경의 조작 대상: 최소 44px.
- 입력칸과 보조 버튼 모서리: 8px. 내용 영역: 14px. 주요 버튼: 캡슐 형태.
- 한 화면의 주요 동작에 채운 파란색을 사용합니다.
- 키보드 선택은 2px 외곽선으로 표시합니다. 사용 불가, 눌림, 오류 상태를 구분합니다.
- 큰 통계 카드를 요약 줄로 정리해 명단 표에 공간을 줍니다.
- 반투명은 탐색 영역과 상단 도구 막대에 제한하고, 데이터 영역은 불투명하게 유지합니다.
- 움직임 줄이기 설정에 대응하고, 반투명이 지원되지 않는 환경에서도 읽을 수 있는 바탕색을 제공합니다.

## 파일 구성

- tokens.css: 색상, 글자, 간격, 모서리, 높이의 공통 값
- input.css: 기존 화면에 적용하는 디자인 제안
- input.html: 기존 프로그램을 사용하는 입력 화면 시안
- index.html, review.css, review.js: 시안과 공통 부품을 함께 보는 검토 화면

## Figma에 옮길 때

색상은 `Color / Canvas`, `Color / Text / Primary`, `Color / Text / Secondary`, `Color / Accent`, `Color / Selection` 등의 변수로 관리합니다.
글자는 `Type / Title`, `Type / Section`, `Type / Body`, `Type / Caption` 스타일로 정리합니다.
버튼 부품은 Type(Primary, Secondary, Tertiary)와 State(Default, Hover, Pressed, Focus, Disabled)를 나누어 관리합니다.
입력칸·선택상자·탐색 항목·표 행도 재사용 부품으로 묶을 수 있습니다.
CSS를 Figma에서 바로 가져오는 파일이라는 뜻은 아니며, 같은 기준으로 제작하기 위한 명세입니다.

## 참고

- [Apple 재질 지침](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Apple 접근성 지침](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Figma 디자인 시스템](https://help.figma.com/hc/en-us/articles/14548865734679-Lesson-3-Build-your-design-system)
