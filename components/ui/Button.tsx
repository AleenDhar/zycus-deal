import { LucideIcon } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline" | "ghost" | "link" | "destructive" | "glass";
    size?: "default" | "sm" | "lg" | "icon";
    isLoading?: boolean;
    leftIcon?: LucideIcon;
    rightIcon?: LucideIcon;
    asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            className,
            variant = "default",
            size = "default",
            isLoading,
            leftIcon: LeftIcon,
            rightIcon: RightIcon,
            children,
            disabled,
            asChild = false,
            ...props
        },
        ref
    ) => {
        const Comp = asChild ? Slot : "button";

        if (asChild) {
            return (
                <Slot
                    ref={ref}
                    className={cn(
                        "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                        {
                            "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm":
                                variant === "default",
                            "border border-input bg-background hover:bg-accent hover:text-accent-foreground":
                                variant === "outline",
                            "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
                            "text-primary underline-offset-4 hover:underline": variant === "link",
                            "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm":
                                variant === "destructive",
                            "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20":
                                variant === "glass",
                            "h-10 px-4 py-2": size === "default",
                            "h-9 rounded-md px-3": size === "sm",
                            "h-11 rounded-md px-8": size === "lg",
                            "h-10 w-10": size === "icon",
                        },
                        className
                    )}
                    {...props}
                >
                    {children}
                </Slot>
            );
        }

        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
                    {
                        "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm":
                            variant === "default",
                        "border border-input bg-background hover:bg-accent hover:text-accent-foreground":
                            variant === "outline",
                        "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
                        "text-primary underline-offset-4 hover:underline": variant === "link",
                        "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm":
                            variant === "destructive",
                        "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20":
                            variant === "glass",
                        "h-10 px-4 py-2": size === "default",
                        "h-9 rounded-md px-3": size === "sm",
                        "h-11 rounded-md px-8": size === "lg",
                        "h-10 w-10": size === "icon",
                    },
                    className
                )}
                disabled={disabled || isLoading}
                {...props}
            >
                {isLoading && (
                    <svg
                        className="mr-2 h-4 w-4 animate-spin"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        ></circle>
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                    </svg>
                )}
                {!isLoading && LeftIcon && <LeftIcon className="mr-2 h-4 w-4" />}
                {children}
                {!isLoading && RightIcon && <RightIcon className="ml-2 h-4 w-4" />}
            </button>
        );
    }
);
Button.displayName = "Button";

export { Button };
