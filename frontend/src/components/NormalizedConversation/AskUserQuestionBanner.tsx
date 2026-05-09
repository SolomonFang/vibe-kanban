import { CheckCircle2, MessageCircleQuestion } from 'lucide-react';
import type { AnsweredQuestion, AskUserQuestionItem } from 'shared/types';

type Props = {
  questions: AskUserQuestionItem[];
  answers?: AnsweredQuestion[];
  statusLabel?: string;
};

type AnsweredMap = Record<string, string[]>;

function buildAnsweredMap(
  answers: AnsweredQuestion[] | undefined
): AnsweredMap {
  if (!answers) return {};
  const map: AnsweredMap = {};
  for (const a of answers) {
    map[a.question] = a.answer;
  }
  return map;
}

const OPTION_BG = 'bg-accent/50 border';
const OPTION_SELECTED_BG =
  'bg-green-50 dark:bg-green-950/20 border-green-400/40';

export default function AskUserQuestionBanner({
  questions,
  answers,
  statusLabel,
}: Props) {
  const answeredMap = buildAnsweredMap(answers);
  const hasAnswers = answers && answers.length > 0;

  return (
    <div className="space-y-3">
      {statusLabel && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircleQuestion className="h-3.5 w-3.5" />
          <span>{statusLabel}</span>
        </div>
      )}
      {questions.map((q, qi) => {
        const selected = answeredMap[q.question] ?? [];

        return (
          <div key={qi} className="border rounded-sm overflow-hidden">
            {q.header && (
              <div className="px-3 py-1.5 bg-muted/50 border-b text-sm font-medium">
                {q.header}
              </div>
            )}
            <div className="px-3 py-2">
              <p className="text-sm mb-2">{q.question}</p>
              <div className="space-y-1">
                {q.options.map((opt, oi) => {
                  const isSelected = selected.includes(opt.label);
                  return (
                    <div
                      key={oi}
                      className={`px-2.5 py-1.5 text-sm rounded-sm ${
                        hasAnswers && isSelected
                          ? OPTION_SELECTED_BG
                          : OPTION_BG
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {hasAnswers && isSelected && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <span className="font-medium">{opt.label}</span>
                          {opt.description && (
                            <span className="text-muted-foreground ml-2">
                              {opt.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {q.multiSelect && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Multi-select
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
