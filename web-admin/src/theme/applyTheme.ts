import { colors } from "./colors";
import { spacing, fontSizes, fontWeights, borderRadius } from "./spacing";

function setCssVariable(name: string, value: string) {
    document.documentElement.style.setProperty(name, value);
}

export function applyTheme() {
    Object.entries(colors).forEach(([key, value]) => {
        setCssVariable(`--${key}`, value);
    });

    Object.entries(spacing).forEach(([key, value]) => {
        setCssVariable(`--spacing-${key}`, value);
    });

    Object.entries(fontSizes).forEach(([key, value]) => {
        setCssVariable(`--font-size-${key}`, value);
    });

    Object.entries(fontWeights).forEach(([key, value]) => {
        setCssVariable(`--font-weight-${key}`, value);
    });

    Object.entries(borderRadius).forEach(([key, value]) => {
        setCssVariable(`--border-radius-${key}`, value);
    });
}