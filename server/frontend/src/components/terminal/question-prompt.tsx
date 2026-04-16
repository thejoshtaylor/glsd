// GLSD — QuestionPrompt component
// Renders an inline text input when Claude Code asks the user a question

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QuestionMessage } from '@/lib/protocol';

interface QuestionPromptProps {
  question: QuestionMessage;
  onAnswer: (answer: string) => void;
}

export function QuestionPrompt({ question, onAnswer }: QuestionPromptProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    if (!value.trim()) return;
    onAnswer(value.trim());
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="border border-blue-500/30 bg-blue-500/10 rounded-lg p-4 mt-2 w-full">
      <h3 className="text-sm font-semibold text-blue-400 mb-2">Question from Claude</h3>

      <p className="text-sm text-foreground mb-3">{question.question}</p>

      {question.options && question.options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {question.options.map((opt) => (
            <Button
              key={opt}
              size="sm"
              variant="outline"
              className="text-xs border-blue-500/40 hover:bg-blue-500/20"
              onClick={() => {
                setValue(opt);
                onAnswer(opt);
              }}
            >
              {opt}
            </Button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer..."
          className="flex-1 text-sm bg-black/30 border-blue-500/30 focus:border-blue-500/60"
          autoFocus
        />
        <Button
          size="sm"
          variant="default"
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleSubmit}
          disabled={!value.trim()}
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
