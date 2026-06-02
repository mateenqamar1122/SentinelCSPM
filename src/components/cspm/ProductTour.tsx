import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

const TOUR_KEY = "sentinel.tour.completed";

export const ProductTour = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (localStorage.getItem(TOUR_KEY)) return;
    if (location.pathname !== "/") return;

    // Wait a beat so the dashboard has rendered
    const t = setTimeout(() => {
      const d = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Got it",
        onDestroyed: () => localStorage.setItem(TOUR_KEY, "1"),
        steps: [
          {
            element: "[data-tour='hero']",
            popover: {
              title: "👋 Welcome to SentinelCSPM",
              description: "We watch your cloud, code, AI workflows, and threats — and translate them into plain English. Let's take a 30-second tour.",
            },
          },
          {
            element: "[data-tour='posture']",
            popover: {
              title: "Your security score",
              description: "One number, 0–100. The higher the better. Updates automatically as we find and you fix issues.",
            },
          },
          {
            element: "[data-tour='pillars']",
            popover: {
              title: "Five security pillars",
              description: "Cloud misconfigurations, code & container vulnerabilities, AI workflow risks, live threat intel, and compliance — all mapped automatically.",
            },
          },
          {
            element: "[data-tour='nav-compliance']",
            popover: {
              title: "Compliance — auto-mapped",
              description: "Findings are mapped to SOC 2, ISO 27001, GDPR, and HIPAA. Great for investor diligence.",
            },
          },
          {
            element: "[data-tour='nav-report']",
            popover: {
              title: "Board-ready report",
              description: "Generate a one-page printable PDF you can share with investors or enterprise prospects.",
              onNextClick: () => {
                d.destroy();
                navigate("/report");
              },
            },
          },
        ],
      });
      d.drive();
    }, 600);

    return () => clearTimeout(t);
  }, [location.pathname, navigate]);

  return null;
};

export const restartTour = () => {
  localStorage.removeItem(TOUR_KEY);
  window.location.href = "/";
};
