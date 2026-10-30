# 마크다운 편집기

가볍고 무료인 Windows 마크다운 편집기입니다. 서버나 브라우저 없이 바로 실행됩니다.

- `.md` 파일을 더블클릭하거나, 창에 끌어다 놓거나, Ctrl+O로 엽니다.
- 편집 · 분할 · 보기 세 가지 화면 (Ctrl+/)
- 저장 Ctrl+S
- 표, 할 일 목록, 코드 블록 지원
- Windows 테마에 맞춰 밝은 화면 · 어두운 화면

## 다른 컴퓨터에서 설치 파일 만들기

처음 한 번만 아래 세 가지를 설치합니다.

1. [Node.js](https://nodejs.org) (LTS)
2. [Rust](https://rustup.rs)
3. Visual Studio 빌드 도구 (C++ 데스크톱 개발 항목 선택)

그다음 이 폴더에서 실행합니다.

```
npm install
npx tauri build
```

설치 파일은 `src-tauri/target/release/bundle/nsis/` 에 만들어집니다.

## 개발할 때

```
npm install
npx tauri dev
```

## 구성

TypeScript + Vite, CodeMirror 6(편집), markdown-it(변환), DOMPurify(안전 처리), Tauri 2(앱 틀).
