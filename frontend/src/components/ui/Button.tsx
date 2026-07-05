import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cnfast";

const buttonVariants = cva(
  "transition disabled:opacity-60 shadow-[0_8px_22px_rgba(30,90,72,0.08)]",
  {
    variants: {
      variant: {
        primary: "rounded-full bg-orange-500 font-semibold text-white hover:bg-orange-600",
        "accent-outline":
          "rounded-full border border-orange-500 font-semibold text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20",
        outline:
          "rounded-full border border-chip-line bg-chip-bg font-semibold text-sea-ink hover:border-orange-400",
        danger:
          "rounded-full border border-red-200 font-medium text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20",
        ghost: "font-semibold text-orange-500 hover:text-orange-600",
        link: "font-semibold text-orange-500 hover:text-orange-600 hover:underline",
        "danger-ghost": "text-red-400 hover:text-red-600",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        lg: "px-8 py-3 text-base",
      },
    },
    compoundVariants: [
      { variant: ["ghost", "link", "danger-ghost"], size: "sm", class: "px-0 py-0" },
      { variant: ["ghost", "link", "danger-ghost"], size: "md", class: "px-0 py-0" },
      { variant: ["ghost", "link", "danger-ghost"], size: "lg", class: "px-0 py-0" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps extends BaseButton.Props, VariantProps<typeof buttonVariants> {}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <BaseButton
      {...props}
      className={(state) =>
        cn(
          buttonVariants({ variant, size }),
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}
