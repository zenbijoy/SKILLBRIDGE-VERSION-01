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

/* Smooth Card Hover Lift with 3D Depth */
.web-interactive-card, .web-card-3d {
  transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.24s ease, border-color 0.24s ease !important;
  border-radius: 18px !important;
}
.web-interactive-card:hover, .web-card-3d:hover {
  transform: translateY(-4px) !important;
  box-shadow: 0 20px 40px -12px rgba(234, 179, 8, 0.22), 0 0 0 1px rgba(250, 204, 21, 0.35) !important;
}

/* 3D Cyber Yellow Primary Button */
.web-btn-yellow-3d {
  background: linear-gradient(135deg, #FACC15 0%, #EAB308 100%) !important;
  color: #0F1015 !important;
  font-weight: 800 !important;
  box-shadow: 0 4px 14px rgba(234, 179, 8, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
  border-radius: 12px !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  cursor: pointer !important;
}
.web-btn-yellow-3d:hover {
  transform: translateY(-2px) scale(1.02) !important;
  box-shadow: 0 8px 24px rgba(234, 179, 8, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.5) !important;
}
.web-btn-yellow-3d:active {
  transform: translateY(1px) scale(0.99) !important;
}

/* 3D Multicolor Action Buttons */
.web-btn-emerald-3d {
  background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important;
  color: #FFFFFF !important;
  font-weight: 700 !important;
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
  border-radius: 12px !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  cursor: pointer !important;
}
.web-btn-emerald-3d:hover {
  transform: translateY(-2px) scale(1.02) !important;
  box-shadow: 0 8px 22px rgba(16, 185, 129, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
}

.web-btn-indigo-3d {
  background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%) !important;
  color: #FFFFFF !important;
  font-weight: 700 !important;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
  border-radius: 12px !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  cursor: pointer !important;
}
.web-btn-indigo-3d:hover {
  transform: translateY(-2px) scale(1.02) !important;
  box-shadow: 0 8px 22px rgba(99, 102, 241, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
}

.web-btn-rose-3d {
  background: linear-gradient(135deg, #F43F5E 0%, #E11D48 100%) !important;
  color: #FFFFFF !important;
  font-weight: 700 !important;
  box-shadow: 0 4px 14px rgba(244, 63, 94, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3) !important;
  border-radius: 12px !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  cursor: pointer !important;
}
.web-btn-rose-3d:hover {
  transform: translateY(-2px) scale(1.02) !important;
  box-shadow: 0 8px 22px rgba(244, 63, 94, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4) !important;
}

/* 3D Glass Elevation */
.web-glass-3d {
  background: rgba(255, 255, 255, 0.88) !important;
  backdrop-filter: blur(16px) !important;
  border: 1px solid rgba(254, 240, 138, 0.4) !important;
  box-shadow: 0 14px 35px -8px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(226, 232, 240, 0.8) !important;
  border-radius: 18px !important;
}

/* Equalizer Live Wave Animation */
@keyframes eqWave {
  0%, 100% { height: 6px; }
  50% { height: 18px; }
}
.eq-bar-1 { animation: eqWave 0.8s ease-in-out infinite 0.1s; }
.eq-bar-2 { animation: eqWave 0.8s ease-in-out infinite 0.3s; }
.eq-bar-3 { animation: eqWave 0.8s ease-in-out infinite 0.2s; }
.eq-bar-4 { animation: eqWave 0.8s ease-in-out infinite 0.4s; }

/* Floating Micro Animations */
@keyframes floatSlow {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-7px) rotate(1.5deg); }
}
@keyframes floatReverse {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(7px) rotate(-1.5deg); }
}
.animate-float-1 { animation: floatSlow 4s ease-in-out infinite; }
.animate-float-2 { animation: floatReverse 5s ease-in-out infinite 0.6s; }

/* Multicolor Mesh Background */
.web-mesh-canvas {
  background-color: #FFFDF5;
  background-image:
    radial-gradient(at 0% 0%, rgba(254, 240, 138, 0.42) 0px, transparent 50%),
    radial-gradient(at 100% 0%, rgba(199, 210, 254, 0.35) 0px, transparent 50%),
    radial-gradient(at 50% 50%, rgba(254, 249, 195, 0.28) 0px, transparent 50%),
    radial-gradient(at 100% 100%, rgba(167, 243, 208, 0.25) 0px, transparent 50%);
  background-attachment: fixed;
}
.dark .web-mesh-canvas, [data-theme="dark"] .web-mesh-canvas {
  background-color: #0A0E1A;
  background-image:
    radial-gradient(at 0% 0%, rgba(234, 179, 8, 0.14) 0px, transparent 50%),
    radial-gradient(at 100% 0%, rgba(99, 102, 241, 0.16) 0px, transparent 50%),
    radial-gradient(at 50% 50%, rgba(14, 165, 233, 0.08) 0px, transparent 50%),
    radial-gradient(at 0% 100%, rgba(16, 185, 129, 0.1) 0px, transparent 50%);
  background-attachment: fixed;
}

/* 3D Badge Pills */
.badge-3d-yellow {
  background: linear-gradient(135deg, rgba(250, 204, 21, 0.18) 0%, rgba(234, 179, 8, 0.1) 100%);
  border: 1px solid rgba(250, 204, 21, 0.4);
  color: #B45309;
  box-shadow: 0 2px 6px rgba(250, 204, 21, 0.15);
}
.badge-3d-cyan {
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.18) 0%, rgba(59, 130, 246, 0.1) 100%);
  border: 1px solid rgba(6, 182, 212, 0.4);
  color: #0284C7;
  box-shadow: 0 2px 6px rgba(6, 182, 212, 0.15);
}
.badge-3d-purple {
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.18) 0%, rgba(99, 102, 241, 0.1) 100%);
  border: 1px solid rgba(168, 85, 247, 0.4);
  color: #7C3AED;
  box-shadow: 0 2px 6px rgba(168, 85, 247, 0.15);
}
.badge-3d-emerald {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(20, 184, 166, 0.1) 100%);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #059669;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.15);
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
