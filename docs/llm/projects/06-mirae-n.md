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
