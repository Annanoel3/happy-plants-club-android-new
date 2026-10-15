// Happy Plants is a phone app only. On wide phones (e.g. an unfolded Galaxy Fold,
// ~880px) the old 768px check flipped the app into its desktop layout (docked
// sidebar, hidden phone menu buttons). Always use the phone layout.
export function useIsMobile() {
  return true
}
