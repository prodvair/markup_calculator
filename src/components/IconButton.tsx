import type { ReactNode } from "react";

type Props = {
  label: string;
  title?: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

export default function IconButton({
  label,
  title,
  className,
  disabled,
  onClick,
  children,
}: Props) {
  return (
    <button
      type="button"
      className={className ? `icon-btn ${className}` : "icon-btn"}
      title={title ?? label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
