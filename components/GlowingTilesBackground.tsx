"use client";

import React, { useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";

interface Pulse {
  isVertical: boolean;
  gridLine: number; // coordinate of channel line (px)
  position: number; // coordinate along the channel (px)
  length: number;
  speed: number;
  intensity: number;
}

export function GlowingTilesBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Grid configuration - Sharp Square Tiles
    const tileSize = 52;
    const gap = 5;
    const stride = tileSize + gap;

    // Mouse coordinates
    let mouseX = -1000;
    let mouseY = -1000;
    let targetMouseX = -1000;
    let targetMouseY = -1000;

    // Active energy pulses traveling through crevices
    const pulses: Pulse[] = [];
    const maxPulses = 36;

    const handlePointerMove = (e: MouseEvent) => {
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      targetMouseX = -1000;
      targetMouseY = -1000;
    };

    const spawnPulse = (w: number, h: number): Pulse => {
      const isVertical = Math.random() > 0.5;
      if (isVertical) {
        // Vertical channel between columns
        const colIndex = Math.floor(Math.random() * (Math.ceil(w / stride) + 2));
        const x = colIndex * stride + tileSize + gap / 2;
        const speed = (Math.random() * 2.2 + 1.2) * (Math.random() > 0.5 ? 1 : -1);
        const length = Math.random() * 140 + 70;
        const position = speed > 0 ? -length : h + length;
        return {
          isVertical: true,
          gridLine: x,
          position,
          length,
          speed,
          intensity: Math.random() * 0.4 + 0.6,
        };
      } else {
        // Horizontal channel between rows
        const rowIndex = Math.floor(Math.random() * (Math.ceil(h / stride) + 2));
        const y = rowIndex * stride + tileSize + gap / 2;
        const speed = (Math.random() * 2.2 + 1.2) * (Math.random() > 0.5 ? 1 : -1);
        const length = Math.random() * 140 + 70;
        const position = speed > 0 ? -length : w + length;
        return {
          isVertical: false,
          gridLine: y,
          position,
          length,
          speed,
          intensity: Math.random() * 0.4 + 0.6,
        };
      }
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      ctx.miterLimit = 2;

      // Seed pulses
      pulses.length = 0;
      for (let i = 0; i < maxPulses; i++) {
        const p = spawnPulse(width, height);
        if (p.isVertical) {
          p.position = Math.random() * height;
        } else {
          p.position = Math.random() * width;
        }
        pulses.push(p);
      }
    };

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("mousemove", handlePointerMove, { passive: true });
    document.addEventListener("mouseleave", handleMouseLeave, { passive: true });

    resize();

    let lastTime = performance.now();
    let isTabVisible = true;

    const handleVisibility = () => {
      isTabVisible = !document.hidden;
      if (isTabVisible) {
        lastTime = performance.now();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Color definitions based on active theme
    // Dark mode: Sharp obsidian black tiles with glowing red pulses beneath
    // Light mode: Sharp porcelain white tiles with glowing cyan/azure blue pulses beneath
    const render = (time: number) => {
      if (!isTabVisible) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const dt = Math.min((time - lastTime) / 16.667, 2.5);
      lastTime = time;

      // Smooth mouse follow
      mouseX += (targetMouseX - mouseX) * 0.12;
      mouseY += (targetMouseY - mouseY) * 0.12;

      const isDark = theme === "dark";

      // Palette configuration
      const bgColor = isDark ? "#08090d" : "#edf2f7";
      const creviceBaseColor = isDark ? "rgba(220, 20, 50, 0.12)" : "rgba(2, 132, 199, 0.14)";
      const pulsePrimary = isDark ? "rgba(255, 30, 60, " : "rgba(2, 132, 199, ";
      const pulseCore = isDark ? "rgba(255, 180, 190, " : "rgba(180, 235, 255, ";
      const mouseGlowColor = isDark ? "rgba(255, 20, 50, " : "rgba(2, 132, 199, ";

      // Clear with background color
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // --- STEP 1: Sharp Crevice Grid Lines ---
      ctx.strokeStyle = creviceBaseColor;
      ctx.lineWidth = gap;
      ctx.beginPath();

      const numCols = Math.ceil(width / stride) + 1;
      const numRows = Math.ceil(height / stride) + 1;

      for (let c = 0; c <= numCols; c++) {
        const x = c * stride + tileSize + gap / 2;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let r = 0; r <= numRows; r++) {
        const y = r * stride + tileSize + gap / 2;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // --- STEP 2: Traveling Neon Energy Pulses ---
      for (let i = 0; i < pulses.length; i++) {
        const p = pulses[i];
        p.position += p.speed * dt * 2.2;

        const maxCoord = p.isVertical ? height : width;
        if (
          (p.speed > 0 && p.position - p.length > maxCoord) ||
          (p.speed < 0 && p.position + p.length < 0)
        ) {
          pulses[i] = spawnPulse(width, height);
          continue;
        }

        const start = p.position - (p.speed > 0 ? p.length : -p.length);
        const end = p.position;

        if (p.isVertical) {
          const grad = ctx.createLinearGradient(0, start, 0, end);
          grad.addColorStop(0, "rgba(255, 255, 255, 0)");
          grad.addColorStop(0.7, `${pulsePrimary}${p.intensity * 0.7})`);
          grad.addColorStop(1, `${pulseCore}${p.intensity * 0.95})`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = gap + 2;
          ctx.beginPath();
          ctx.moveTo(p.gridLine, start);
          ctx.lineTo(p.gridLine, end);
          ctx.stroke();
        } else {
          const grad = ctx.createLinearGradient(start, 0, end, 0);
          grad.addColorStop(0, "rgba(255, 255, 255, 0)");
          grad.addColorStop(0.7, `${pulsePrimary}${p.intensity * 0.7})`);
          grad.addColorStop(1, `${pulseCore}${p.intensity * 0.95})`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = gap + 2;
          ctx.beginPath();
          ctx.moveTo(start, p.gridLine);
          ctx.lineTo(end, p.gridLine);
          ctx.stroke();
        }
      }

      // --- STEP 3: Interactive Mouse Crevice Luminescence ---
      if (mouseX > -200 && mouseY > -200) {
        const radialGrad = ctx.createRadialGradient(mouseX, mouseY, 10, mouseX, mouseY, 320);
        radialGrad.addColorStop(0, `${mouseGlowColor}0.5)`);
        radialGrad.addColorStop(0.4, `${mouseGlowColor}0.25)`);
        radialGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = radialGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // --- STEP 4: Render Sharp 90-Degree Square Tiles (Zero Rounded Edges) ---
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          const x = c * stride;
          const y = r * stride;

          // Distance from mouse for interactive elevation / border highlight
          const centerX = x + tileSize / 2;
          const centerY = y + tileSize / 2;
          const dist = Math.hypot(centerX - mouseX, centerY - mouseY);
          const mouseFactor = Math.max(0, 1 - dist / 260);

          if (isDark) {
            // Dark Mode Tile (Sharp Obsidian / Carbon Slab)
            const baseColor = mouseFactor > 0
              ? `rgb(${Math.floor(14 + mouseFactor * 14)}, ${Math.floor(16 + mouseFactor * 10)}, ${Math.floor(22 + mouseFactor * 16)})`
              : "#0d0f15";

            // Sharp tile surface
            ctx.fillStyle = baseColor;
            ctx.fillRect(x, y, tileSize, tileSize);

            // Subtle linear top-to-bottom surface sheen
            const tileGrad = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
            tileGrad.addColorStop(0, `rgba(255, 255, 255, ${0.05 + mouseFactor * 0.08})`);
            tileGrad.addColorStop(1, "rgba(0, 0, 0, 0.45)");
            ctx.fillStyle = tileGrad;
            ctx.fillRect(x, y, tileSize, tileSize);

            // Sharp border / perimeter rim
            ctx.lineWidth = 1;
            if (mouseFactor > 0.05) {
              ctx.strokeStyle = `rgba(255, 45, 75, ${mouseFactor * 0.75})`;
            } else {
              ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
            }
            ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
          } else {
            // Light Mode Tile (Sharp Pure Ceramic Porcelain White Slab)
            const baseColor = mouseFactor > 0
              ? `rgb(${Math.floor(255 - mouseFactor * 6)}, ${Math.floor(255 - mouseFactor * 3)}, 255)`
              : "#ffffff";

            // Sharp tile surface
            ctx.fillStyle = baseColor;
            ctx.fillRect(x, y, tileSize, tileSize);

            // Crisp surface gradient
            const tileGrad = ctx.createLinearGradient(x, y, x, y + tileSize);
            tileGrad.addColorStop(0, "#ffffff");
            tileGrad.addColorStop(1, "#f1f5f9");
            ctx.fillStyle = tileGrad;
            ctx.fillRect(x, y, tileSize, tileSize);

            // Sharp border / perimeter rim
            ctx.lineWidth = 1;
            if (mouseFactor > 0.05) {
              ctx.strokeStyle = `rgba(2, 132, 199, ${mouseFactor * 0.75})`;
            } else {
              ctx.strokeStyle = "rgba(15, 23, 42, 0.08)";
            }
            ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handlePointerMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [theme]);

  return (
    <div
      aria-hidden="true"
      className="glowing-tiles-viewport"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: -1,
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
