import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import type { AskUserQuestionItem, QuestionAnswer } from 'shared/types';
import { MessageCircleQuestion, Loader2 } from 'lucide-react';

export interface AskUserQuestionBannerHandle {
  submitCustomAnswer: (text: string) => void;
}

interface Props {
  questions: AskUserQuestionItem[];
  onSubmitAnswers: (answers: QuestionAnswer[]) => void;
  isSubmitting: boolean;
  isTimedOut: boolean;
  error: string | null;
}

const AskUserQuestionBanner = forwardRef<
  AskUserQuestionBannerHandle,
  Props
>(function AskUserQuestionBanner(
  { questions, onSubmitAnswers, isSubmitting, isTimedOut, error },
  ref
) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [multiSelectLabels, setMultiSelectLabels] = useState<Set<string>>(
    new Set()
  );
  const [customText, setCustomText] = useState('');

  const toQuestionAnswers = useCallback(
    (rec: Record<string, string[]>): QuestionAnswer[] =>
      questions
        .filter((q) => rec[q.question] !== undefined)
        .map((q) => ({ question: q.question, answer: rec[q.question] })),
    [questions]
  );

  const currentIndex = useMemo(() => {
    for (let i = 0; i < questions.length; i++) {
      if (answers[questions[i].question] === undefined) return i;
    }
    return questions.length;
  }, [questions, answers]);

  const currentQuestion =
    currentIndex < questions.length ? questions[currentIndex] : null;
  const isAllAnswered = currentIndex >= questions.length;
  const disabled = isSubmitting || isTimedOut;
  const totalQuestions = questions.length;

  const handleSelectOption = useCallback(
    (label: string) => {
      if (disabled || !currentQuestion) return;

      if (currentQuestion.multiSelect) {
        setMultiSelectLabels((prev) => {
          const next = new Set(prev);
          if (next.has(label)) {
            next.delete(label);
          } else {
            next.add(label);
          }
          return next;
        });
      } else {
        const newAnswers = {
          ...answers,
          [currentQuestion.question]: [label],
        };
        setAnswers(newAnswers);
        setCustomText('');

        if (currentIndex === totalQuestions - 1) {
          onSubmitAnswers(toQuestionAnswers(newAnswers));
        }
      }
    },
    [
      disabled,
      currentQuestion,
      answers,
      currentIndex,
      totalQuestions,
      onSubmitAnswers,
      toQuestionAnswers,
    ]
  );

  const handleConfirmMultiSelect = useCallback(() => {
    if (disabled || !currentQuestion) return;

    const labels = Array.from(multiSelectLabels);
    if (labels.length === 0) return;

    const newAnswers = {
      ...answers,
      [currentQuestion.question]: labels,
    };
    setAnswers(newAnswers);
    setMultiSelectLabels(new Set());
    setCustomText('');

    if (currentIndex === totalQuestions - 1) {
      onSubmitAnswers(toQuestionAnswers(newAnswers));
    }
  }, [
    disabled,
    currentQuestion,
    multiSelectLabels,
    answers,
    currentIndex,
    totalQuestions,
    onSubmitAnswers,
    toQuestionAnswers,
  ]);

  const handleCustomSubmit = useCallback(() => {
    if (disabled || !currentQuestion || !customText.trim()) return;

    const newAnswers = {
      ...answers,
      [currentQuestion.question]: [customText.trim()],
    };
    setAnswers(newAnswers);
    setCustomText('');

    if (currentIndex === totalQuestions - 1) {
      onSubmitAnswers(toQuestionAnswers(newAnswers));
    }
  }, [
    disabled,
    currentQuestion,
    customText,
    answers,
    currentIndex,
    totalQuestions,
    onSubmitAnswers,
    toQuestionAnswers,
  ]);

  const handleCustomKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCustomSubmit();
      }
    },
    [handleCustomSubmit]
  );

  useImperativeHandle(
    ref,
    () => ({
      submitCustomAnswer: (text: string) => {
        if (disabled || !currentQuestion || !text.trim()) return;
        const newAnswers = {
          ...answers,
          [currentQuestion.question]: [text.trim()],
        };
        setAnswers(newAnswers);
        if (currentIndex === totalQuestions - 1) {
          onSubmitAnswers(toQuestionAnswers(newAnswers));
        }
      },
    }),
    [
      disabled,
      currentQuestion,
      answers,
      currentIndex,
      totalQuestions,
      onSubmitAnswers,
      toQuestionAnswers,
    ]
  );

  if (isAllAnswered && !isSubmitting) return null;

  return (
    <div className="border rounded-sm overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/30 border-b">
        <MessageCircleQuestion className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm">
          Ask User Question
          {totalQuestions > 1 && (
            <span className="text-muted-foreground ml-1">
              ({Math.min(currentIndex + 1, totalQuestions)}/{totalQuestions})
            </span>
          )}
        </span>
      </div>

      {currentQuestion && (
        <div className="px-3 py-2">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-sm">
              {currentQuestion.header}
            </span>
            {currentQuestion.multiSelect && (
              <span className="text-xs text-muted-foreground">
                Select multiple
              </span>
            )}
          </div>
          <p className="text-sm font-medium mb-2">{currentQuestion.question}</p>

          <div className="flex flex-wrap gap-1.5">
            {currentQuestion.options.map((opt) => {
              const isSelected =
                currentQuestion.multiSelect &&
                multiSelectLabels.has(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectOption(opt.label)}
                  title={opt.description}
                  className={[
                    'rounded-md border px-2.5 py-1.5 text-xs transition-all',
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-accent',
                    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                  ].join(' ')}
                >
                  <span className="font-medium">{opt.label}</span>
                  {opt.description && (
                    <span className="text-muted-foreground ml-1.5 text-xs">
                      {opt.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {currentQuestion.multiSelect && multiSelectLabels.size > 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleConfirmMultiSelect}
              className="mt-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Confirm selection
            </button>
          )}

          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">
              Other:
            </span>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              disabled={disabled}
              placeholder="Type a custom answer and press Enter..."
              className="flex-1 min-w-0 border rounded-sm px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            {customText.trim() && (
              <button
                type="button"
                disabled={disabled}
                onClick={handleCustomSubmit}
                className="rounded-sm bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Submit
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 text-xs text-destructive border-t">
          {error}
        </div>
      )}

      {isSubmitting && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Submitting...
        </div>
      )}
    </div>
  );
});

export default AskUserQuestionBanner;
