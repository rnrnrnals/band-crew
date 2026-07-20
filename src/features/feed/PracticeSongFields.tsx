import {
  formatPracticeSongTitle,
  parsePracticeSongTitle,
  validatePracticeSongFields,
} from '../../utils/teamPracticeSessions';
import './PracticeSongFields.css';

interface PracticeSongFieldsProps {
  artist: string;
  songTitle: string;
  onArtistChange: (value: string) => void;
  onSongTitleChange: (value: string) => void;
  artistId?: string;
  songTitleId?: string;
}

export function PracticeSongFields({
  artist,
  songTitle,
  onArtistChange,
  onSongTitleChange,
  artistId = 'practice-song-artist',
  songTitleId = 'practice-song-title',
}: PracticeSongFieldsProps) {
  return (
    <div className="practice-song-fields">
      <div className="field">
        <label htmlFor={artistId}>가수</label>
        <input
          id={artistId}
          value={artist}
          onChange={(event) => onArtistChange(event.target.value)}
          placeholder="가수"
          maxLength={40}
        />
      </div>
      <div className="field">
        <label htmlFor={songTitleId}>제목</label>
        <input
          id={songTitleId}
          value={songTitle}
          onChange={(event) => onSongTitleChange(event.target.value)}
          placeholder="제목"
          maxLength={40}
        />
      </div>
    </div>
  );
}

export { formatPracticeSongTitle, parsePracticeSongTitle, validatePracticeSongFields };
