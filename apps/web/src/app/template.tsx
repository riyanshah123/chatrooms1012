"use client";

import { motion } from "framer-motion";

/**
 * Wraps every route — remounts on navigation, so each page fades/slides in
 * for a smoother feel than an instant snap. Kept subtle and fast so it never
 * gets in the way.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
