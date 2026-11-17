// Global type declarations for the dashboard app

/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />

declare module '*.json' {
    const value: Record<string, unknown>;
    export default value;
}
