---
type: doc
title: "Git Graph — Obsidian Plugin"
created: 2026-03-26
updated: 2026-09-02
---
# Git Graph — Obsidian Plugin

Git Graph는 Obsidian 사이드바에서 **로컬 Git 저장소의 커밋 이력과 브랜치 그래프**를 확인하는 데스크톱 플러그인이다. 저장소의 파일을 GitHub에서 탐색하는 플러그인이 아니며, 저장소 경로를 직접 읽어 네트워크나 GitHub 토큰 없이 동작한다.

## Features

- **커밋 그래프** — 커밋 간 부모 관계와 브랜치를 lane 기반 그래프로 표시
- **커밋 상세 패널** — 선택한 커밋의 메시지·작성자·날짜·변경 파일·line diff 표시
- **Initial/merge commit 지원** — root diff를 포함하고 merge commit처럼 line diff가 없는 경우도 안내
- **저장소 전환** — 여러 로컬 저장소를 등록하고 사이드바에서 활성 저장소를 전환
- **브랜치 범위 전환** — `Show All Branches`로 전체 브랜치 또는 현재 브랜치의 이력 조회
- **커밋 검색** — subject, author, short hash, ref 이름으로 필터링
- **커밋 작업 메뉴** — hash와 커밋 메시지를 클립보드에 복사
- **캐시 없는 새로고침** — Refresh 버튼으로 현재 저장소의 Git 이력을 다시 읽기
- **Obsidian 테마 대응** — Obsidian CSS 변수를 사용해 dark/light 테마 지원

## Installation

### Community Plugin Browser

1. Obsidian → Settings → Community Plugins를 연다.
2. Browse에서 **Git Graph**를 검색한다.
3. Install 후 Enable을 누른다.

### Manual

1. [Releases](https://github.com/Brookky/obsidian-github-tree/releases/latest)에서 `main.js`, `manifest.json`, `styles.css`를 받는다.
2. Vault의 `.obsidian/plugins/obsidian-github-tree/` 폴더를 만든다.
3. 세 파일을 해당 폴더에 넣는다.
4. Settings → Community Plugins에서 Git Graph를 활성화한다.

## Setup

1. 왼쪽 리본의 Git Graph 아이콘을 클릭하거나 Command palette에서 **Open Git Graph**를 실행한다.
2. Settings → Git Graph에서 **Add Repository**를 누른다.
3. 저장소 루트의 절대 경로를 입력한다. 예: `/Users/you/Documents/my-repo`
4. 필요하면 사이드바 드롭다운에 표시할 Display Name을 입력한다.
5. `Max Commits`는 저장소별로 불러올 최대 커밋 수를 50~2,000 범위에서 설정한다.
6. `Show All Branches by Default`를 켜면 Git `--all` 범위로 커밋을 읽는다.

등록 경로가 Git 저장소가 아니거나 읽기에 실패하면 플러그인은 오류 Notice를 표시한다. 개인 저장소를 보기 위해 GitHub Personal Access Token을 설정할 필요는 없다.

## Usage

| Action | Result |
|---|---|
| Git Graph 아이콘 / `Open Git Graph` | Git Graph 사이드바 열기 |
| 저장소 드롭다운 | 활성 로컬 저장소 전환 |
| `All branches` 토글 | 현재 저장소의 전체 브랜치 이력 포함 여부 전환 |
| 커밋 클릭 | 상세 패널에서 메시지·변경 파일·diff 보기 |
| 검색 입력 | subject·author·short hash·ref 기준 필터링 |
| 커밋 우클릭 | full hash·short hash·커밋 메시지 복사 |
| Refresh | Git log 다시 읽기 |
| 상세 패널 닫기 | 커밋 목록으로 돌아가기 |
| Settings 버튼 | Git Graph 설정 열기 |

## Development

```bash
git clone https://github.com/Brookky/obsidian-github-tree
cd obsidian-github-tree
npm install
npm run dev       # watch mode
npm run build     # TypeScript 검사 + production bundle
npm run docs:test # README와 manifest/UI 계약 검사
```

빌드 결과물 `main.js`, `manifest.json`, `styles.css`를 Vault의 `.obsidian/plugins/obsidian-github-tree/`에 복사해 Obsidian에서 확인한다. `npm run docs:test`는 README가 현재 플러그인의 이름·로컬 저장소 모델·핵심 명령과 일치하는지 결정적으로 검사한다.

## License

MIT
