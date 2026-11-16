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
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 ${className}`}
        >
          Routine
        </span>
      );
    case "MUST":
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30 ${className}`}
        >
          Must
        </span>
      );
    case "SHOULD":
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 ${className}`}
        >
          Should
        </span>
      );
    default:
      return null;
  }
};
