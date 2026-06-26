# 미래엔 AI 디지털 교과서

::: info 프로젝트 개요
- **기간**: 2024.05 ~ 2024.10 (6개월)
- **역할**: Frontend Developer
- **소속**: LG CNS → 미래엔 (고객사)
- **도메인**: 교육부 AI 디지털 교과서(AIDT) 사업
:::

---

## 배경 및 목적

교육부의 **AI 디지털 교과서 사업**에 참여한 미래엔 프로젝트.  
학생이 사용하는 디지털 교과서의 학습 컨텐츠 UI 컴포넌트를 개발하고,  
외부 솔루션(STT, 수식 비교) PoC를 진행했다.

---

## 주요 구현

### 학습 컨텐츠 공통 컴포넌트

```tsx
interface QuizProps {
  question: string;
  options: string[];
  correctIndex: number;
  onAnswer: (isCorrect: boolean) => void;
}

const Quiz: React.FC<QuizProps> = ({ question, options, correctIndex, onAnswer }) => {
  const [selected, setSelected] = useState<number | null>(null);

  const handleSelect = (idx: number) => {
    setSelected(idx);
    onAnswer(idx === correctIndex);
  };

  return (
    <div className="quiz-container">
      <p className="question">{question}</p>
      {options.map((opt, idx) => (
        <button
          key={idx}
          className={selected === idx ? (idx === correctIndex ? 'correct' : 'wrong') : ''}
          onClick={() => handleSelect(idx)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
};
```

- 컴포넌트 사용 가이드 문서(Storybook 형태) 작성
- 다양한 컨텐츠 유형(객관식, 주관식, 빈칸 채우기)에 대응하는 공통 인터페이스 설계

### 티맥스 협업 — 공통 컴포넌트 개발 및 검증

미래엔 교과서 플랫폼의 기반이 되는 **티맥스 공통 컴포넌트 라이브러리**와의 협업을 수행했다.

#### 공통 컴포넌트 개발

- 티맥스 측 컴포넌트 명세를 기반으로 교육 콘텐츠 특화 확장 구현
- 디자인 토큰 및 Props 인터페이스를 티맥스 라이브러리 규격에 맞춰 정렬하여 일관성 확보
- 양측 컴포넌트 간 충돌 없는 통합을 위한 네임스페이스 및 스타일 격리 전략 적용

#### 검증 과정

| 단계 | 내용 |
|------|------|
| 인터페이스 검증 | 티맥스 컴포넌트 Props 규격과 미래엔 요구사항 간 호환성 확인 |
| 렌더링 검증 | 다양한 디바이스(태블릿, PC) 및 해상도 환경에서의 UI 정합성 테스트 |
| 회귀 테스트 | 라이브러리 업데이트 시 기존 컴포넌트 동작 유지 여부 확인 |
| 엣지케이스 검증 | 빈 데이터, 긴 텍스트, 특수문자 등 예외 입력값에 대한 안전성 검증 |

#### 제어 방식 고려

- **Controlled vs Uncontrolled**: 티맥스 컴포넌트가 내부 상태를 직접 관리하는 구조였기 때문에, 교과서 앱 레벨에서 상태를 제어해야 하는 경우 `value` / `onChange` 패턴으로 Controlled 방식 전환 여부를 결정
- **이벤트 버블링 제어**: 중첩 컴포넌트 간 클릭 이벤트 충돌 방지를 위한 `stopPropagation` 적용 지점 협의
- **외부 상태 연동**: 전역 학습 진행 상태(Context/Redux)와 티맥스 컴포넌트 내부 상태 간 동기화 방식 설계

### 외부 솔루션 PoC

| 솔루션 | 목적 | 결과 |
|--------|------|------|
| STT (Speech-to-Text) | 학생 구술 답변 인식 | 한국어 인식률 및 지연 시간 검증 |
| LaTeX 수식 답안 비교 | 수학 답안 자동 채점 | 수식 파싱 정확도 및 엣지케이스 검증 |

---

## 핵심 학습

- **공통 컴포넌트 설계**: 재사용성과 확장성을 고려한 Props 인터페이스 설계의 중요성
- **PoC 방법론**: 외부 솔루션 검증 시 Happy Path 뿐만 아니라 엣지케이스(방언, 특수 수식) 테스트 필수
- **EdTech 도메인**: 다양한 연령대/디바이스 환경을 고려한 접근성(a11y) 중요
