import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cloud,
  Boxes,
  BrainCircuit,
  Radar,
  History,
  FileBadge2,
  FileText,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { AddConnectionDialog } from "./AddConnectionDialog";
import { AddAssetDialog } from "./AddAssetDialog";
import { restartTour } from "./ProductTour";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";

interface DockAction {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  type: "link" | "dialog" | "action";
  path?: string;
  action?: () => void;
  dialogComponent?: React.ComponentType<{ trigger: React.ReactNode }>;
}

const ALL_ACTIONS: DockAction[] = [
  {
    id: "connect-cloud",
    label: "Connect Cloud",
    description: "Add AWS, GCP, or Azure connection",
    icon: Cloud,
    type: "dialog",
    dialogComponent: AddConnectionDialog,
  },
  {
    id: "add-asset",
    label: "Add Asset",
    description: "Scan code repos or container images",
    icon: Boxes,
    type: "dialog",
    dialogComponent: AddAssetDialog,
  },
  {
    id: "ai-soc",
    label: "AI SOC",
    description: "AI incident investigation and chat",
    icon: BrainCircuit,
    type: "link",
    path: "/ai-soc",
  },
  {
    id: "threat-intel",
    label: "Threat Intel",
    description: "Real-time threat feeds & vulnerability tracking",
    icon: Radar,
    type: "link",
    path: "/threat-intel",
  },
  {
    id: "scans",
    label: "Scan History",
    description: "View recent assets scan status",
    icon: History,
    type: "link",
    path: "/scans",
  },
  {
    id: "compliance",
    label: "Compliance Center",
    description: "SOC 2, ISO 27001 posture mappings",
    icon: FileBadge2,
    type: "link",
    path: "/compliance",
  },
  {
    id: "report",
    label: "Board Report",
    description: "Download printable executive security report",
    icon: FileText,
    type: "link",
    path: "/report",
  },
  {
    id: "restart-tour",
    label: "Restart Tour",
    description: "Re-run the welcome product walkthrough",
    icon: RotateCcw,
    type: "action",
    action: restartTour,
  },
];

const DEFAULT_ACTIONS = [
  "connect-cloud",
  "add-asset",
  "ai-soc",
  "threat-intel",
  "restart-tour",
];

export const FloatingDock = () => {
  const [activeActionIds, setActiveActionIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sentinel.dock.activeActions");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return DEFAULT_ACTIONS;
        }
      }
      return DEFAULT_ACTIONS;
    }
    return DEFAULT_ACTIONS;
  });

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sentinel.dock.activeActions", JSON.stringify(activeActionIds));
  }, [activeActionIds]);

  const toggleAction = (id: string) => {
    setActiveActionIds((prev) => {
      if (prev.includes(id)) {
        // Keep at least one action enabled
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const activeActions = ALL_ACTIONS.filter((action) =>
    activeActionIds.includes(action.id)
  );

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex justify-center">
      <motion.div
        layout
        className="pointer-events-auto bg-background/85 dark:bg-card/85 backdrop-blur-xl border border-border/80 px-3 py-2 rounded-full flex items-center gap-1.5 shadow-2xl relative"
        transition={{ type: "spring", stiffness: 450, damping: 30 }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {activeActions.map((action) => {
            const Icon = action.icon;

            const buttonEl = (
              <motion.button
                whileHover={{ scale: 1.18, y: -4 }}
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon className="w-5 h-5" />
              </motion.button>
            );

            let renderItem;
            if (action.type === "dialog" && action.dialogComponent) {
              const DialogComp = action.dialogComponent;
              renderItem = <DialogComp trigger={buttonEl} />;
            } else if (action.type === "link" && action.path) {
              renderItem = (
                <Link to={action.path} className="focus-visible:outline-none">
                  {buttonEl}
                </Link>
              );
            } else {
              renderItem = (
                <div onClick={action.action} className="cursor-pointer">
                  {buttonEl}
                </div>
              );
            }

            return (
              <motion.div
                key={action.id}
                layout
                initial={{ opacity: 0, scale: 0.6, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.6, y: 15 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="relative"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>{renderItem}</div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="flex flex-col gap-0.5 text-xs py-1.5 px-2.5 bg-popover/95 border border-border/80 shadow-lg backdrop-blur-sm">
                    <p className="font-semibold text-foreground">{action.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-normal max-w-[180px]">
                      {action.description}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Separator */}
        <div className="w-px h-5 bg-border/80 mx-1 shrink-0" />

        {/* Customization Button */}
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.95 }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isOpen
                      ? "text-primary bg-secondary/80"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </motion.button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              <p className="font-semibold">Customize Dock</p>
              <p className="text-[10px] text-muted-foreground">Add/remove quick actions</p>
            </TooltipContent>
          </Tooltip>

          <PopoverContent
            side="top"
            align="end"
            sideOffset={12}
            className="w-72 p-3 bg-popover/98 border border-border/80 shadow-2xl backdrop-blur-md rounded-xl z-50 pointer-events-auto"
          >
            <div className="space-y-1.5 pb-2 mb-2 border-b border-border/80">
              <h4 className="font-semibold text-sm leading-none">Customize Dock</h4>
              <p className="text-[11px] text-muted-foreground">
                Select quick action buttons to pin to your bottom dock.
              </p>
            </div>
            <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
              {ALL_ACTIONS.map((action) => {
                const Icon = action.icon;
                const isChecked = activeActionIds.includes(action.id);
                return (
                  <label
                    key={action.id}
                    className="flex items-center justify-between gap-3 p-2 hover:bg-secondary/50 rounded-lg transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {action.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                          {action.description}
                        </p>
                      </div>
                    </div>
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleAction(action.id)}
                      disabled={isChecked && activeActionIds.length <= 1}
                      className="shrink-0"
                    />
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </motion.div>
    </div>
  );
};
