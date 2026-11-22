import React from "react";
import { TaskCategory } from "../types";

interface BadgeProps {
  category: TaskCategory;
  className?: string;
}

export const CategoryBadge: React.FC<BadgeProps> = ({ category, className = "" }) => {
  switch (category) {
    case "ROUTINE":
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 ${className}`}
        >
          Routine
        </span>
      );
    case "MUST":
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20 ${className}`}
        >
          Must
        </span>
      );
    case "SHOULD":
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/20 ${className}`}
        >
          Should
        </span>
      );
    default:
      return null;
  }
};
