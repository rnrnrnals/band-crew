import { useApp } from '../../state/AppContext';
import { useConfirm } from '../../components/ConfirmDialog';
import { FeedCard } from './FeedCard';
import './PostDetailSheet.css';

interface PostDetailSheetProps {
  postId: string;
  canDelete?: boolean;
  onClose: () => void;
}

export function PostDetailSheet({ postId, canDelete = false, onClose }: PostDetailSheetProps) {
  const { posts, deletePost } = useApp();
  const confirm = useConfirm();
  const post = posts.find((p) => p.id === postId);

  if (!post) return null;

  const handleDelete = async () => {
    if (!(await confirm('삭제하시겠습니까?'))) return;
    deletePost(postId);
    onClose();
  };

  return (
    <div className="post-detail-backdrop" onClick={onClose} role="presentation">
      <div
        className="post-detail-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="게시물"
      >
        <header className="post-detail-head">
          {canDelete ? (
            <button type="button" className="post-detail-delete" onClick={handleDelete}>
              삭제
            </button>
          ) : (
            <span aria-hidden />
          )}
          <button type="button" className="post-detail-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        <div className="post-detail-body">
          <FeedCard post={post} />
        </div>
      </div>
    </div>
  );
}
