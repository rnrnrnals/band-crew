import { useMemo } from 'react';
import { splitCommentWithTimestamps } from '../../utils/audioCommentUtils';
import './CommentTimestampText.css';

interface CommentTimestampTextProps {
  text: string;
  onTimestampClick?: (seconds: number) => void;
}

export function CommentTimestampText({ text, onTimestampClick }: CommentTimestampTextProps) {
  const parts = useMemo(() => splitCommentWithTimestamps(text), [text]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'timestamp') {
          return (
            <button
              key={`${index}-${part.text}`}
              type="button"
              className="comment-timestamp-link"
              onClick={(event) => {
                event.stopPropagation();
                onTimestampClick?.(part.seconds);
              }}
            >
              {part.text}
            </button>
          );
        }
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}
