"use client";

import { useEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

/**
 * The landing page motion layer.
 * - Lenis smooth scrolling (light lerp, wheel only; touch keeps native scroll).
 * - GSAP entrances: [data-rise] on load, [data-reveal] as each enters view,
 *   rising a little with opacity, staggered, once.
 * Everything is skipped under prefers-reduced-motion. The hidden starting
 * state lives in globals.css behind html.js, with a CSS failsafe that shows
 * content if this script never runs.
 */
export function LandingMotion() {
  useEffect(() => {
    document.documentElement.classList.add("motion-ready");
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1, anchors: true });
      lenis.on("scroll", ScrollTrigger.update);
      const raf = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);

      gsap.to("[data-rise]", {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.09,
        delay: 0.35,
      });

      ScrollTrigger.batch("[data-reveal]", {
        start: "top 88%",
        once: true,
        onEnter: (els) =>
          gsap.to(els, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out", stagger: 0.08 }),
      });

      return () => {
        gsap.ticker.remove(raf);
        lenis.destroy();
      };
    });

    return () => {
      mm.revert();
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);

  return null;
}
