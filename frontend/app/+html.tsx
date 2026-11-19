import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Web styling resets and dynamic professional animations
const webGlobalStyles = `
/* CSS Resets for React Native Web */
html, body, #root {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', Helvetica, Arial, sans-serif;
  scroll-behavior: smooth;
}

/* Custom Sleek Web Scrollbars */
::-webkit-scrollbar {
  width: 7px;
  height: 7px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 9999px;
  transition: background 0.2s ease;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.65);
}

/* Smooth selection tint */
::selection {
  background: rgba(37, 99, 235, 0.28);
  color: inherit;
}

/* Remove default focus outline halo on mouse click, keep accessible */
:focus:not(:focus-visible) {
  outline: none;
}

/* Smooth cursor for clickable elements */
[role="button"], button, a, [data-interactive="true"] {
  cursor: pointer;
  user-select: none;
}

/* Dynamic Keyframe Animations */
@keyframes slideDownHeader {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slideUpPill {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes pulseLiveRing {
  0% {
    transform: scale(0.98);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
  }
  100% {
    transform: scale(0.98);
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
  }
}

@keyframes gradientRotate {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.animate-slide-down {
  animation: slideDownHeader 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-slide-up {
  animation: slideUpPill 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-pulse-live {
  animation: pulseLiveRing 2s infinite;
}

/* Smooth Card Hover Lift */
.web-interactive-card {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease, border-color 0.22s ease !important;
}
.web-interactive-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04) !important;
}

/* Story Gradient Ring */
.story-ring-active {
  background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
  background-size: 200% 200%;
  animation: gradientRotate 3s ease infinite;
}

.story-ring-live {
  background: linear-gradient(135deg, #10B981, #06B6D4, #3B82F6);
  background-size: 200% 200%;
  animation: gradientRotate 2.5s ease infinite;
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="description" content="SkillBridge - Peer-to-Peer Academic & Skill Exchange Platform" />
        <title>SkillBridge | Campus Skill & Knowledge Exchange</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: webGlobalStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
