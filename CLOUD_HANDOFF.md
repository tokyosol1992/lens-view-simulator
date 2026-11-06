# 렌즈 시뮬레이터 · 클라우드 작업 인수인계

| 환경 표시 이름 | 개발 원본 |
| --- | --- |
| 동물의GYM | `tokyosol1992/animal-gym` |
| MoHo · 포트폴리오 | `tokyosol1992/tokyosol1992.github.io` |
| 렌즈 시뮬레이터 | `tokyosol1992/lens-view-simulator` |
| 아사달 | `tokyosol1992/asadal` |

GitHub 저장소는 총 6개를 보존한다. `animal-gym-review`는 공개 검토 배포 전용이고 `ohsolgil`은 이전 주소·원본 이력 보존용이다. 새 개발은 위 4개에서 한다. 배포용 저장소를 개발 원본으로 선택하거나 개수를 맞추기 위해 삭제하지 않는다.

## 이 프로젝트

- 원본: `tokyosol1992/lens-view-simulator`
- 현재 상태: `STATUS.md`
- 히스토리: `HISTORY.md`
- 결정: `DECISIONS.md`
- 다음 기준: 독립 정적 사이트를 유지하며 사용자 요청에 따라 개선한다. MoHo로 소스를 옮기거나 공개 경로를 바꾸는 작업은 별도 결정한다.

## 새 작업 · 이어받기

1. AGENTS.md·CLAUDE.md·README.md와 위 상태·결정·관련 최신 히스토리를 읽는다. 채팅 내용을 이미 안다고 가정하지 않는다.
2. 현재 원격 주소·브랜치·HEAD·작업 트리와 열린 PR을 확인한다. 새 작업은 최신 main에서 작업별 브랜치를 만든다. 이어받기는 기록된 작업 브랜치의 최신 원격 커밋에서 단독 진행한다.
3. 서로 다른 AI·작업은 별도 브랜치를 쓴다. 같은 브랜치를 동시에 편집하거나 미커밋 파일을 덮어쓰거나 강제 푸시하지 않는다.
4. 종료 시 한국 시간 날짜, 요청·결정·실패/철회·변경·검증·한계·다음 작업을 히스토리와 현재 상태에 기록하고 코드와 함께 커밋·푸시한다. 원격 브랜치·커밋·PR 링크를 남긴다.
5. 로컬 저장·원격 푸시·main 병합·배포·사용자 승인을 구분한다. 새 기기에서 같은 저장소와 브랜치를 선택했는지 확인한다. 채팅 전체·MCP 인증은 Git에 자동 동기화되지 않는다.

## 설치와 시작

저장소 루트에서 설치:

```bash
bash scripts/cloud-setup.sh
```

Codex 시작 스킬에 사용할 지침:

> 이 환경의 개발 원본은 tokyosol1992/lens-view-simulator입니다. AGENTS.md, CLAUDE.md, README.md, CLOUD_HANDOFF.md와 관련 최신 상태·결정을 읽으세요. 현재 저장소·브랜치·원격 HEAD와 미커밋 작업을 확인하세요. 독립 정적 사이트를 유지하며 사용자 요청에 따라 개선한다. MoHo로 소스를 옮기거나 공개 경로를 바꾸는 작업은 별도 결정한다. 작업 기록과 코드의 원격 반영 상태를 구분하고, 종료할 때 히스토리·현재 상태·다음 작업을 함께 저장하세요. 배포 전용 저장소를 별도 개발 원본으로 사용하지 마세요.

Claude의 환경 설정 스크립트는 `scripts/claude-environment-setup.sh` 내용으로 저장하며 런타임만 준비한다. 저장소별 설치는 `.claude/settings.json`이 `scripts/claude-session-start.sh`를 호출해 수행한다. 후자는 일반 Local 세션에서는 자동 설치하지 않는다. 설치 스크립트 안에 저장소가 체크아웃돼 있다고 가정하지 않는다.

## 플랫폼 확인과 초기화 수정

- Claude: 같은 한글 이름의 전용 Cloud 환경 4개를 생성하고 각각 원본 하나만 연결했다. 기본 Default 환경·기존 대화는 보존한다. 환경 선택으로 지정된 저장소를 선택할 수 있으며 전체 저장소 검색 목록을 4개로 제한했다고 가정하지 않는다.
- Claude 읽기 시험: 아사달의 새 Cloud 세션에서 새 원본 `tokyosol1992/asadal`, AGENTS·CLAUDE·이름 변경 이력과 인수인계 규칙을 읽었다. 파일 수정·커밋·푸시는 하지 않도록 제한했다.
- 실패·수정: 최초 설치가 저장소 바깥에서 시작되어 `git rev-parse`와 기준 문서 읽기가 실패했다. 환경 설치는 저장소와 무관한 런타임 준비만 수행하고, 실제 저장소 설치는 `CLAUDE_PROJECT_DIR`가 정해지는 SessionStart에서 실행하도록 바꿨다. 실패 이력과 읽기 성공을 구분한다.
- Node 프로젝트 환경: npm으로 Node 24를 외부 캐시에 준비하며 `BASH_ENV=/root/.cache/ai-cloud/node24-env.sh`로 새 Bash 명령의 PATH를 맞춘다. 시크릿·네트워크 권한은 추가하지 않는다. 아사달은 Python 확인만 필요하다.
- Codex: 계정 환경 설정 화면은 앞선 브라우저 보안 정책으로 접근이 차단됐다. 이 작업에서 재게시나 새 Codex Cloud 세션 시험을 완료했다고 기록하지 않는다. 저장소 파일 변경은 적용됐으므로 계정 환경 편집에서 재게시한 뒤 새 작업으로 확인해야 한다.
- 다음 검증: 이 수정 이후의 새 Claude 세션에서 설정 스크립트·SessionStart 성공을 확인한다. 세션을 열기 전에 최신 원격 main과 환경의 연결 저장소를 확인한다. 두 플랫폼 간 양방향 실제 세션 시험은 아직 완료 전이다.


## 실제 반영 근거

## 2026-11-06 (Asia/Seoul) · 승인된 통합 실행

- 사용자 승인: 제안한 6단계 플랜을 실행한다. 저장소 삭제나 비공개 원본의 공개 이전은 포함하지 않는다.
- 병합 완료: 동물의GYM [#39](https://github.com/tokyosol1992/animal-gym/pull/39), 공개 검토 [#15](https://github.com/tokyosol1992/animal-gym-review/pull/15) `a73a3710fb73d5d08ac40af7f9fd747b93f3ffb3`, MoHo 통합 [#16](https://github.com/tokyosol1992/tokyosol1992.github.io/pull/16) `4219a601880e213c478886953631e4b229d44ac6`, 이전 주소 호환 [#11](https://github.com/tokyosol1992/ohsolgil/pull/11) `784ede9b3161dac113a028a4d4e8685a3bd31456`.
- 배포 성공: MoHo [42162241924](https://github.com/tokyosol1992/tokyosol1992.github.io/actions/runs/42162241924), 기존 포트폴리오 주소 [42162546782](https://github.com/tokyosol1992/ohsolgil/actions/runs/42162546782), 공개 검토 [42162224658](https://github.com/tokyosol1992/animal-gym-review/actions/runs/42162224658).
- 실서비스 확인: MoHo `/`, 포트폴리오 `/portfolio/`, 검토 `/animal-gym-review/`, 렌즈 `/lens-view-simulator/` 모두 HTTP 200. MoHo 로컬 정적 자산 8개·포트폴리오 2개가 200이고 옛 `/ohsolgil/`의 새 주소 이동 HTML을 확인했다.
- 기존 미병합 후보·브랜치·원본 기록은 보존한다. `ohsolgil` PR #3·#10의 시안은 main에 자동 반영하지 않았다. 두 보조 저장소 모두 아직 보관·삭제하지 않았다. 검토 배포는 계속 갱신하고 포트폴리오 이전 작업은 별도 범위를 정해 재개한다.


## 이번 변경의 로컬 검사

네 저장소의 셸 구문·SessionStart JSON·일반 Local 세션의 자동 설치 생략을 확인했다. 저장소 밖 `/tmp`에서 아사달 기준 문서 8개 읽기와 렌즈 광학·카탈로그 검사를 실행해 통과했다. 렌즈 GPU·브라우저 검사나 실제 앱 전체 검사를 새로 통과한 것으로 확대하지 않는다.
