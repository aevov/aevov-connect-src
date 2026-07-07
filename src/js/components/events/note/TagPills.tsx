import { memo } from 'react';

type Props = {
  event: any;
};

const TagPills = ({ event }: Props) => {
  const tags = (event.tags || []).filter((t: string[]) => t[0] === 't').map((t: string[]) => t[1]);
  if (!tags.length) return null;

  return (
    <div className="flex flex-wrap gap-1 my-1">
      {tags.map((tag: string) => (
        <a
          key={tag}
          href={`/search/${encodeURIComponent('#' + tag)}`}
          className="text-xs px-2 py-0.5 rounded-full bg-primary-soft text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          #{tag}
        </a>
      ))}
    </div>
  );
};

export default memo(TagPills);
