import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { playEnter } from "../../lib/sound";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}

export function CustomSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "Select...",
  disabled = false,
  className = "",
  buttonClassName = "",
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    playEnter();
  };

  return (
    <div ref={containerRef} className={`relative text-left ${className}`}>
      {label && (
        <label className="block text-2xs font-semibold text-stone-500 dark:text-stone-400 mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center justify-between gap-2 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:text-stone-200 shadow-2xs hover:bg-stone-200/70 dark:hover:bg-stone-750 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-stone-400 dark:text-stone-500 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-stone-700 dark:text-stone-200" : ""
          }`}
        />
      </button>

      {/* Styled Glassmorphic Dropdown Menu */}
      {isOpen && (
        <div
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 mt-1 min-w-[130px] w-full rounded-xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-750 p-1 shadow-floating animate-scale-in"
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(opt.value)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition text-left cursor-pointer ${
                  isSelected
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-semibold"
                    : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </div>
                {isSelected && <Check className="h-3 w-3 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
