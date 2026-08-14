import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PageRecord } from '../domain/models';

export interface EditorPage extends PageRecord {
  thumbnailUrl: string;
}

interface PageGridProps {
  pages: EditorPage[];
  onReorder: (pageIds: string[]) => void;
  onRotate: (pageId: string) => void;
  onDelete: (page: EditorPage, trigger: HTMLElement) => void;
  disabled: boolean;
}

interface SortablePageProps {
  page: EditorPage;
  position: number;
  onRotate: (pageId: string) => void;
  onDelete: (page: EditorPage, trigger: HTMLElement) => void;
  disabled: boolean;
}

function SortablePage({ page, position, onRotate, onDelete, disabled }: SortablePageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
  } = useSortable({ id: page.id, disabled });
  const pageNumber = position + 1;

  return (
    <article
      ref={setNodeRef}
      className="editor-page"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={`Page ${pageNumber}`}
    >
      <div className="thumbnail-viewport">
        <img
          className="page-thumbnail"
          src={page.thumbnailUrl}
          alt={`Thumbnail for page ${pageNumber}`}
          style={{ transform: `rotate(${page.rotation}deg)` }}
        />
      </div>
      <div className="page-card-actions">
        <div className="page-label">
          <strong>Page {pageNumber}</strong>
          {position === 0 && <span>Cover</span>}
        </div>
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="drag-handle"
          aria-label={`Reorder page ${pageNumber}`}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          Reorder
        </button>
        <button type="button" onClick={() => onRotate(page.id)} disabled={disabled} aria-label={`Rotate page ${pageNumber}`}>
          Rotate
        </button>
        <button
          type="button"
          className="destructive"
          onClick={(event) => onDelete(page, event.currentTarget)}
          disabled={disabled}
          aria-label={`Delete page ${pageNumber}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export function PageGrid({ pages, onReorder, onRotate, onDelete, disabled }: PageGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const oldIndex = pages.findIndex((page) => page.id === active.id);
        const newIndex = pages.findIndex((page) => page.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(pages, oldIndex, newIndex);
        onReorder(reordered.map((page) => page.id));
      }}
    >
      <SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
        <section className="page-grid" aria-label="Ebook pages">
          {pages.map((page, index) => (
            <SortablePage
              key={page.id}
              page={page}
              position={index}
              onRotate={onRotate}
              onDelete={onDelete}
              disabled={disabled}
            />
          ))}
        </section>
      </SortableContext>
    </DndContext>
  );
}
